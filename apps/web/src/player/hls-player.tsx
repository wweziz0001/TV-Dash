import { useEffect, useRef, useState, type FocusEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import Hls from "hls.js";
import { AlertTriangle, GripHorizontal, LoaderCircle, Pause, Play, RotateCcw, Signal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QualityOption } from "@/types/api";
import {
  defaultPlayerSeekState,
  getPlayerBrowserCapabilities,
  getPlayerSeekState,
  isFullscreenActive,
  isPictureInPictureActive,
  seekVideoByOffset,
  type PlayerBrowserCapabilities,
  type PlayerSeekState,
} from "./browser-media";
import { syncPlayerMediaSession } from "./media-session";
import { buildPlayerDiagnostics, type PlayerDiagnostics, type PlayerPictureInPictureMode } from "./playback-diagnostics";
import { PlayerControlOverlay } from "./player-control-overlay";
import { getFatalRecoveryAction, type PlayerFailureKind, type PlayerStatus } from "./playback-recovery";
import { buildQualityOptions, defaultQualityOptions, resolvePreferredQuality } from "./quality-options";
import {
  buildFloatingPlayerWindowFeatures,
  clampFloatingPlayerLayout,
  countFloatingPlayers,
  getDefaultFloatingPlayerLayout,
  getNextFloatingPlayerZIndex,
  type FloatingPlayerLayout,
} from "./floating-player";
import {
  buildFloatingPlayerRoute,
  createFloatingPlayerSession,
  getFloatingPlayerSession,
  listFloatingPlayerSessions,
  removeFloatingPlayerSession,
  saveFloatingPlayerSession,
  type FloatingPlayerSession,
  type FloatingPlayerSessionRuntimeState,
} from "./floating-player-session";

interface HlsPlayerProps {
  src: string | null;
  title: string;
  muted?: boolean;
  autoPlay?: boolean;
  preferredQuality?: string | null;
  initialBias?: "AUTO" | "LOWEST";
  className?: string;
  controlDensity?: "micro" | "compact" | "full";
  floatingEnvironment?: "main-app" | "detached-window";
  fullscreenTargetRef?: RefObject<HTMLElement | null>;
  onMutedChange?: (muted: boolean) => void;
  onQualityOptionsChange?: (options: QualityOption[]) => void;
  onSelectedQualityChange?: (value: string) => void;
  onStatusChange?: (status: PlayerStatus) => void;
  onDiagnosticsChange?: (diagnostics: PlayerDiagnostics) => void;
}

export type { PlayerStatus } from "./playback-recovery";
export type { PlayerDiagnostics } from "./playback-diagnostics";

const defaultBrowserCapabilities: PlayerBrowserCapabilities = {
  canFullscreen: false,
  canPictureInPicture: false,
  canNativePictureInPicture: false,
  canFloatingPlayback: false,
  canDetachedFloatingPlayback: false,
  canDocumentPictureInPicture: false,
  canUseMediaSession: false,
  pictureInPictureUnavailableReason: "Picture-in-Picture is not supported in this browser.",
  floatingPlaybackUnavailableReason: "TV-Dash floating playback is not supported in this browser.",
};

const SEEK_STEP_SECONDS = 10;
const FLOATING_PLAYER_HOST_CLASS_NAME = "tv-dash-floating-player-host h-full w-full";

interface DocumentPictureInPictureWindow extends Window {
  document: Document;
}

interface DocumentPictureInPictureApi {
  requestWindow?: (options?: { width?: number; height?: number }) => Promise<DocumentPictureInPictureWindow>;
}

function getDocumentPictureInPictureApi(win: Window) {
  return (win as Window & { documentPictureInPicture?: DocumentPictureInPictureApi }).documentPictureInPicture;
}

function copyDocumentStyles(sourceDocument: Document, targetDocument: Document) {
  targetDocument.head.innerHTML = "";

  sourceDocument.querySelectorAll("style, link[rel='stylesheet']").forEach((node) => {
    targetDocument.head.appendChild(node.cloneNode(true));
  });

  targetDocument.body.style.margin = "0";
  targetDocument.body.style.background = "#020617";
  targetDocument.body.style.overflow = "hidden";
}

function formatPlaybackTime(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function HlsPlayer({
  src,
  title,
  muted = true,
  autoPlay = true,
  preferredQuality = "AUTO",
  initialBias = "AUTO",
  className,
  controlDensity = "full",
  floatingEnvironment = "main-app",
  fullscreenTargetRef,
  onMutedChange,
  onQualityOptionsChange,
  onSelectedQualityChange,
  onStatusChange,
  onDiagnosticsChange,
}: HlsPlayerProps) {
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const recoveryNoticeTimeoutRef = useRef<number | null>(null);
  const controlsVisibilityTimeoutRef = useRef<number | null>(null);
  const qualityOptionsRef = useRef<QualityOption[]>([...defaultQualityOptions]);
  const selectionModeRef = useRef<"AUTO" | "MANUAL">("AUTO");
  const sessionIdRef = useRef(0);
  const hasStartedPlaybackRef = useRef(false);
  const wasRecoveringRef = useRef(false);
  const floatingPlayerInteractionCleanupRef = useRef<(() => void) | null>(null);
  const floatingLayoutRef = useRef<FloatingPlayerLayout | null>(null);
  const detachedWindowRef = useRef<Window | null>(null);
  const documentPictureInPictureWindowRef = useRef<DocumentPictureInPictureWindow | null>(null);
  const recoveryStateRef = useRef({
    networkAttempts: 0,
    mediaAttempts: 0,
  });
  const callbacksRef = useRef({
    onMutedChange,
    onQualityOptionsChange,
    onSelectedQualityChange,
    onStatusChange,
    onDiagnosticsChange,
  });
  const playbackSettingsRef = useRef({
    autoPlay,
    initialBias,
    preferredQuality,
  });

  const [status, setStatus] = useState<PlayerStatus>(src ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [failureKind, setFailureKind] = useState<PlayerFailureKind | null>(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [playerMuted, setPlayerMuted] = useState(muted);
  const [volume, setVolume] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [seekState, setSeekState] = useState<PlayerSeekState>(defaultPlayerSeekState);
  const [currentTime, setCurrentTime] = useState(0);
  const [capabilities, setCapabilities] = useState<PlayerBrowserCapabilities>(defaultBrowserCapabilities);
  const [pictureInPictureMode, setPictureInPictureMode] = useState<PlayerPictureInPictureMode>("none");
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const [areControlsVisible, setAreControlsVisible] = useState(false);
  const [surfacePortalHost] = useState<HTMLDivElement | null>(() => {
    if (typeof document === "undefined") {
      return null;
    }

    const host = document.createElement("div");
    host.className = FLOATING_PLAYER_HOST_CLASS_NAME;
    return host;
  });
  const [inlineSurfaceAnchor, setInlineSurfaceAnchor] = useState<HTMLDivElement | null>(null);
  const [floatingLayout, setFloatingLayout] = useState<FloatingPlayerLayout | null>(null);
  const [detachedSession, setDetachedSession] = useState<FloatingPlayerSession | null>(null);
  const [isDocumentPictureInPictureMode, setIsDocumentPictureInPictureMode] = useState(false);
  const isFloatingMode = floatingLayout !== null;
  const isDetachedWindow = floatingEnvironment === "detached-window";
  const isDetachedMode = detachedSession !== null || isDetachedWindow;
  const isPictureInPictureMode = pictureInPictureMode !== "none";
  const effectiveSrc = detachedSession ? null : src;

  callbacksRef.current = {
    onMutedChange,
    onQualityOptionsChange,
    onSelectedQualityChange,
    onStatusChange,
    onDiagnosticsChange,
  };
  playbackSettingsRef.current = {
    autoPlay,
    initialBias,
    preferredQuality,
  };

  function getFullscreenTarget() {
    return fullscreenTargetRef?.current ?? playerFrameRef.current;
  }

  function setFloatingPlayerLayout(nextLayout: FloatingPlayerLayout | null) {
    floatingLayoutRef.current = nextLayout;
    setFloatingLayout(nextLayout);
  }

  function setDetachedFloatingSession(nextSession: FloatingPlayerSession | null) {
    setDetachedSession(nextSession);
  }

  function setDocumentPictureInPictureMode(nextValue: boolean) {
    setIsDocumentPictureInPictureMode(nextValue);
  }

  function updateStatus(nextStatus: PlayerStatus) {
    setStatus(nextStatus);
    callbacksRef.current.onStatusChange?.(nextStatus);
  }

  function clearReconnectTimeout() {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }

  function clearRecoveryNoticeTimeout() {
    if (recoveryNoticeTimeoutRef.current !== null) {
      window.clearTimeout(recoveryNoticeTimeoutRef.current);
      recoveryNoticeTimeoutRef.current = null;
    }
  }

  function clearControlsVisibilityTimeout() {
    if (controlsVisibilityTimeoutRef.current !== null) {
      window.clearTimeout(controlsVisibilityTimeoutRef.current);
      controlsVisibilityTimeoutRef.current = null;
    }
  }

  function clearFloatingPlayerInteraction() {
    floatingPlayerInteractionCleanupRef.current?.();
    floatingPlayerInteractionCleanupRef.current = null;
  }

  function showRecoveryNotice(message: string) {
    clearRecoveryNoticeTimeout();
    setRecoveryNotice(message);
    recoveryNoticeTimeoutRef.current = window.setTimeout(() => {
      setRecoveryNotice(null);
      recoveryNoticeTimeoutRef.current = null;
    }, 2200);
  }

  function scheduleControlsHide() {
    clearControlsVisibilityTimeout();
    controlsVisibilityTimeoutRef.current = window.setTimeout(() => {
      setAreControlsVisible(false);
      controlsVisibilityTimeoutRef.current = null;
    }, 1400);
  }

  function showControls() {
    setAreControlsVisible(true);
    scheduleControlsHide();
  }

  function hideControls() {
    clearControlsVisibilityTimeout();
    setAreControlsVisible(false);
  }

  function bringFloatingPlayerToFront() {
    const activeLayout = floatingLayoutRef.current;

    if (!activeLayout) {
      return;
    }

    setFloatingPlayerLayout({
      ...activeLayout,
      zIndex: getNextFloatingPlayerZIndex(),
    });
  }

  function openFloatingPlayer(statusMessage: string) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const nextLayout = floatingLayoutRef.current
      ? clampFloatingPlayerLayout(
          {
            ...floatingLayoutRef.current,
            zIndex: getNextFloatingPlayerZIndex(),
          },
          viewportWidth,
          viewportHeight,
        )
      : getDefaultFloatingPlayerLayout(countFloatingPlayers(document), viewportWidth, viewportHeight);

    setFloatingPlayerLayout(nextLayout);
    setStatusDetail(statusMessage);
    showControls();
  }

  function closeFloatingPlayer(statusMessage = "Returned the floating player to the page.") {
    setFloatingPlayerLayout(null);
    setStatusDetail(statusMessage);
    clearFloatingPlayerInteraction();
    showControls();
  }

  function cleanupDocumentPictureInPictureWindow() {
    documentPictureInPictureWindowRef.current = null;
    setDocumentPictureInPictureMode(false);
  }

  function closeDocumentPictureInPictureWindow(statusMessage = "Returned the floating player to the page.") {
    const activeWindow = documentPictureInPictureWindowRef.current;

    cleanupDocumentPictureInPictureWindow();
    setStatusDetail(statusMessage);
    showControls();
    activeWindow?.close();
  }

  function returnDetachedPlayerToPage(statusMessage = "Returned the detached player to the page.") {
    const activeSession = detachedSession;

    if (!activeSession) {
      return;
    }

    removeFloatingPlayerSession(activeSession.id);
    setDetachedFloatingSession(null);
    setStatusDetail(statusMessage);
    showControls();
  }

  function focusDetachedPlayerWindow() {
    if (!detachedSession) {
      return;
    }

    if (detachedWindowRef.current && !detachedWindowRef.current.closed) {
      detachedWindowRef.current.focus();
      return;
    }

    detachedWindowRef.current = window.open(
      buildFloatingPlayerRoute(detachedSession.id),
      detachedSession.id,
      buildFloatingPlayerWindowFeatures(detachedSession.window),
    );
    detachedWindowRef.current?.focus();
  }

  function focusDocumentPictureInPictureWindow() {
    documentPictureInPictureWindowRef.current?.focus();
  }

  function startFloatingPlayerInteraction(
    mode: "drag" | "resize",
    event: ReactPointerEvent<HTMLElement>,
  ) {
    const activeLayout = floatingLayoutRef.current;

    if (!activeLayout) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    bringFloatingPlayerToFront();
    showControls();

    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = activeLayout;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const nextLayout = clampFloatingPlayerLayout(
        mode === "drag"
          ? {
              ...startLayout,
              left: startLayout.left + deltaX,
              top: startLayout.top + deltaY,
            }
          : {
              ...startLayout,
              width: startLayout.width + deltaX,
              height: startLayout.height + deltaY,
            },
        window.innerWidth,
        window.innerHeight,
      );

      setFloatingPlayerLayout(nextLayout);
    };

    const finishInteraction = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishInteraction);
      window.removeEventListener("pointercancel", finishInteraction);
      floatingPlayerInteractionCleanupRef.current = null;
    };

    clearFloatingPlayerInteraction();
    floatingPlayerInteractionCleanupRef.current = finishInteraction;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishInteraction);
    window.addEventListener("pointercancel", finishInteraction);
  }

  function teardownVideo(video: HTMLVideoElement) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  function stopPlayback() {
    clearReconnectTimeout();

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }

  function publishQualityOptions(options: QualityOption[]) {
    qualityOptionsRef.current = options.length ? options : [...defaultQualityOptions];
    callbacksRef.current.onQualityOptionsChange?.(qualityOptionsRef.current);
  }

  function applyPreferredQuality(requested: string | null | undefined) {
    const hls = hlsRef.current;
    const resolvedSelection = resolvePreferredQuality(requested, qualityOptionsRef.current);

    selectionModeRef.current = resolvedSelection.mode;
    callbacksRef.current.onSelectedQualityChange?.(resolvedSelection.selectedValue);

    if (!hls) {
      return;
    }

    hls.currentLevel = resolvedSelection.level;
  }

  function getStartupPreferredQuality() {
    const { initialBias: currentInitialBias, preferredQuality: currentPreferredQuality } =
      playbackSettingsRef.current;

    return currentInitialBias === "LOWEST" && currentPreferredQuality === "AUTO"
      ? "LOWEST"
      : currentPreferredQuality;
  }

  function syncBrowserState() {
    const video = videoRef.current;
    const fullscreenTarget = getFullscreenTarget();
    const activeDocument = document;
    const nextCapabilities = getPlayerBrowserCapabilities(
      video,
      fullscreenTarget,
      activeDocument,
      navigator,
      window,
    );

    setCapabilities(nextCapabilities);
    setPictureInPictureMode(
      isDetachedWindow
        ? "detached"
        : detachedSession
          ? "detached"
          : isDocumentPictureInPictureMode
            ? "floating"
          : floatingLayoutRef.current
        ? "floating"
        : isPictureInPictureActive(video, activeDocument)
          ? "native"
          : "none",
    );
    setIsFullscreenMode(isFullscreenActive(fullscreenTarget, activeDocument));
    setSeekState(getPlayerSeekState(video));

    if (!video) {
      return;
    }

    setCurrentTime(video.currentTime);
    setVolume(video.volume);
    setIsPaused(Boolean(video.currentSrc || effectiveSrc) && video.paused && !video.ended);
  }

  function applyMutedState(nextMuted: boolean) {
    setPlayerMuted(nextMuted);
    callbacksRef.current.onMutedChange?.(nextMuted);
  }

  async function resumePlayback() {
    const video = videoRef.current;

    if (!video || !effectiveSrc) {
      return;
    }

    setStatusDetail(hasStartedPlaybackRef.current ? "Resuming live playback..." : "Starting playback...");

    try {
      await video.play();
      setIsPaused(false);
    } catch {
      setStatusDetail("Playback start was blocked by the browser. Use the in-player controls to try again.");
      updateStatus("playing");
      setIsPaused(true);
    }
  }

  function pausePlayback(detail = "Playback paused by the operator.") {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.pause();
    setStatusDetail(detail);
    updateStatus("playing");
    setIsPaused(true);
  }

  function handleTogglePlayback() {
    const video = videoRef.current;

    if (!video || !effectiveSrc) {
      return;
    }

    if (video.paused || video.ended) {
      void resumePlayback();
      return;
    }

    pausePlayback();
  }

  function handleToggleMute() {
    applyMutedState(!playerMuted);
  }

  function handleVolumeChange(nextVolume: number) {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.volume = nextVolume;
    setVolume(nextVolume);

    if (nextVolume <= 0 && !playerMuted) {
      applyMutedState(true);
      return;
    }

    if (nextVolume > 0 && playerMuted) {
      applyMutedState(false);
    }
  }

  function handleSeek(offsetSeconds: number) {
    const video = videoRef.current;

    if (!seekVideoByOffset(video, offsetSeconds)) {
      return;
    }

    setStatusDetail(offsetSeconds < 0 ? "Stepped backward inside the live DVR window." : "Stepped forward toward live.");
    syncBrowserState();
  }

  function handleSeekTo(value: number) {
    const video = videoRef.current;

    if (!video || !seekState.canSeek || seekState.rangeStart === null || seekState.rangeEnd === null) {
      return;
    }

    const nextTime = Math.min(seekState.rangeEnd, Math.max(seekState.rangeStart, value));
    video.currentTime = nextTime;
    setStatusDetail("Adjusted playback position inside the live DVR window.");
    syncBrowserState();
  }

  function handleJumpToLive() {
    const video = videoRef.current;

    if (!video || !seekState.canSeek || seekState.rangeEnd === null) {
      return;
    }

    video.currentTime = seekState.rangeEnd;
    setStatusDetail("Returned to the live edge.");
    syncBrowserState();
  }

  function handleToggleFloatingPlayback() {
    if (!src) {
      return;
    }

    if (isDocumentPictureInPictureMode) {
      closeDocumentPictureInPictureWindow();
      return;
    }

    if (detachedSession) {
      returnDetachedPlayerToPage();
      return;
    }

    if (floatingLayoutRef.current) {
      closeFloatingPlayer();
      return;
    }

    const floatingWindowLayout = getDefaultFloatingPlayerLayout(
      listFloatingPlayerSessions().length,
      window.innerWidth,
      window.innerHeight,
    );
    const session = createFloatingPlayerSession({
      title,
      src,
      returnPath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      preferredQuality,
      muted: playerMuted,
      window: {
        left: window.screenX + floatingWindowLayout.left,
        top: window.screenY + floatingWindowLayout.top,
        width: floatingWindowLayout.width,
        height: floatingWindowLayout.height,
      },
    });

    if (capabilities.canDocumentPictureInPicture) {
      const documentPictureInPictureApi = getDocumentPictureInPictureApi(window);

      if (typeof documentPictureInPictureApi?.requestWindow === "function") {
        void documentPictureInPictureApi
          .requestWindow({
            width: floatingWindowLayout.width,
            height: floatingWindowLayout.height,
          })
          .then((documentPictureInPictureWindow) => {
            copyDocumentStyles(document, documentPictureInPictureWindow.document);
            documentPictureInPictureWindow.document.title = `${title} · Floating Player · TV-Dash`;
            documentPictureInPictureWindow.document.body.dataset.tvDashDocumentPictureInPicture = "true";

            const handleDocumentPictureInPictureClosed = () => {
              cleanupDocumentPictureInPictureWindow();
              setStatusDetail("Returned the floating player to the page.");
              showControls();
            };

            documentPictureInPictureWindow.addEventListener(
              "pagehide",
              handleDocumentPictureInPictureClosed,
              { once: true },
            );

            documentPictureInPictureWindowRef.current = documentPictureInPictureWindow;
            setDocumentPictureInPictureMode(true);
            setStatusDetail("Opened the floating player in a compact TV-Dash window.");
            showControls();
          })
          .catch(() => {
            if (capabilities.canDetachedFloatingPlayback) {
              saveFloatingPlayerSession(session);
              detachedWindowRef.current = window.open(
                buildFloatingPlayerRoute(session.id),
                session.id,
                buildFloatingPlayerWindowFeatures(session.window),
              );

              if (detachedWindowRef.current) {
                detachedWindowRef.current.focus();
                setDetachedFloatingSession(session);
                setStatusDetail("Opened a detached TV-Dash floating player window.");
                showControls();
                return;
              }

              removeFloatingPlayerSession(session.id);
            }

            if (capabilities.canFloatingPlayback) {
              openFloatingPlayer(
                "Compact floating window launch was blocked, so TV-Dash opened an in-page floating player instead.",
              );
              return;
            }

            setStatusDetail(
              capabilities.floatingPlaybackUnavailableReason ??
                "TV-Dash floating playback could not be opened in this browser session.",
            );
          });

        return;
      }
    }

    if (capabilities.canDetachedFloatingPlayback) {
      saveFloatingPlayerSession(session);
      detachedWindowRef.current = window.open(
        buildFloatingPlayerRoute(session.id),
        session.id,
        buildFloatingPlayerWindowFeatures(session.window),
      );

      if (detachedWindowRef.current) {
        if (floatingLayoutRef.current) {
          closeFloatingPlayer();
        }

        detachedWindowRef.current.focus();
        setDetachedFloatingSession(session);
        setStatusDetail("Opened a detached TV-Dash floating player window.");
        showControls();
        return;
      }

      removeFloatingPlayerSession(session.id);
    }

    if (capabilities.canFloatingPlayback) {
      openFloatingPlayer(
        "Detached window launch was blocked, so TV-Dash opened an in-page floating player instead.",
      );
      return;
    }

    setStatusDetail(
      capabilities.floatingPlaybackUnavailableReason ??
        "TV-Dash floating playback could not be opened in this browser session.",
    );
  }

  function handleToggleNativePictureInPicture() {
    const video = videoRef.current;

    if (!video || !effectiveSrc) {
      return;
    }

    void (async () => {
      try {
        if (document.pictureInPictureElement === video) {
          await document.exitPictureInPicture?.();
          setStatusDetail("Returned the player to the tab.");
          showControls();
          return;
        }

        if (document.pictureInPictureElement && document.pictureInPictureElement !== video) {
          setStatusDetail("Another browser Picture-in-Picture session is already active.");
          return;
        }

        if (capabilities.canNativePictureInPicture) {
          await video.requestPictureInPicture?.();
          setStatusDetail("Opened Picture-in-Picture. Playback now continues in the browser PiP window.");
          showControls();
          return;
        }
      } catch {
        setStatusDetail("Picture-in-Picture could not be opened in this browser session.");
      } finally {
        syncBrowserState();
      }
    })();
  }

  async function handleToggleFullscreen() {
    const fullscreenTarget = getFullscreenTarget();

    if (!fullscreenTarget) {
      return;
    }

    try {
      if (document.fullscreenElement === fullscreenTarget) {
        await document.exitFullscreen?.();
      } else {
        await fullscreenTarget.requestFullscreen?.();
      }
    } catch {
      setStatusDetail("Fullscreen could not be changed in this browser session.");
    } finally {
      syncBrowserState();
    }
  }

  function handlePointerEnter() {
    showControls();
  }

  function handlePointerMove() {
    showControls();
  }

  function handlePointerLeave() {
    hideControls();
  }

  function handleFocusWithin() {
    showControls();
  }

  function handleBlurWithin(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    hideControls();
  }

  useEffect(() => {
    setPlayerMuted(muted);
  }, [muted]);

  useEffect(() => {
    callbacksRef.current.onDiagnosticsChange?.(
      buildPlayerDiagnostics({
        status: detachedSession?.runtimeState?.status ?? status,
        statusDetail:
          detachedSession?.runtimeState
            ? "Playback is running in a detached TV-Dash floating window."
            : statusDetail,
        error,
        failureKind,
        recoveryNotice,
        muted: detachedSession?.runtimeState?.isMuted ?? playerMuted,
        isPaused: detachedSession?.runtimeState?.isPaused ?? isPaused,
        volume: detachedSession?.runtimeState?.volume ?? volume,
        isPictureInPictureActive: isPictureInPictureMode,
        pictureInPictureMode,
        isFullscreenActive: detachedSession?.runtimeState?.isFullscreenActive ?? isFullscreenMode,
        canPictureInPicture: capabilities.canPictureInPicture,
        canSeek: detachedSession?.runtimeState?.canSeek ?? seekState.canSeek,
        isAtLiveEdge: detachedSession?.runtimeState?.isAtLiveEdge ?? seekState.isAtLiveEdge,
        liveLatencySeconds: detachedSession?.runtimeState?.liveLatencySeconds ?? seekState.liveLatencySeconds,
      }),
    );
  }, [
    capabilities.canPictureInPicture,
    detachedSession,
    error,
    failureKind,
    isFullscreenMode,
    isPaused,
    isPictureInPictureMode,
    pictureInPictureMode,
    playerMuted,
    recoveryNotice,
    seekState.canSeek,
    seekState.isAtLiveEdge,
    seekState.liveLatencySeconds,
    status,
    statusDetail,
    volume,
  ]);

  useEffect(() => {
    if (!surfacePortalHost) {
      return;
    }

    const targetParent = isDocumentPictureInPictureMode
      ? documentPictureInPictureWindowRef.current?.document.body ?? null
      : floatingLayout
        ? document.body
        : inlineSurfaceAnchor;

    if (!targetParent) {
      return;
    }

    targetParent.appendChild(surfacePortalHost);
    surfacePortalHost.dataset.tvDashFloatingPlayer =
      floatingLayout || isDocumentPictureInPictureMode ? "true" : "false";

    if (isDocumentPictureInPictureMode) {
      surfacePortalHost.style.position = "relative";
      surfacePortalHost.style.left = "0";
      surfacePortalHost.style.top = "0";
      surfacePortalHost.style.width = "100vw";
      surfacePortalHost.style.height = "100vh";
      surfacePortalHost.style.zIndex = "";
    } else if (floatingLayout) {
      surfacePortalHost.style.position = "fixed";
      surfacePortalHost.style.left = `${floatingLayout.left}px`;
      surfacePortalHost.style.top = `${floatingLayout.top}px`;
      surfacePortalHost.style.width = `${floatingLayout.width}px`;
      surfacePortalHost.style.height = `${floatingLayout.height}px`;
      surfacePortalHost.style.zIndex = String(floatingLayout.zIndex);
    } else {
      surfacePortalHost.style.position = "";
      surfacePortalHost.style.left = "";
      surfacePortalHost.style.top = "";
      surfacePortalHost.style.width = "";
      surfacePortalHost.style.height = "";
      surfacePortalHost.style.zIndex = "";
    }

    return () => {
      if (surfacePortalHost.parentElement === targetParent) {
        targetParent.removeChild(surfacePortalHost);
      }
    };
  }, [floatingLayout, inlineSurfaceAnchor, isDocumentPictureInPictureMode, surfacePortalHost]);

  useEffect(() => {
    if (!floatingLayout) {
      return;
    }

    function handleViewportResize() {
      if (!floatingLayoutRef.current) {
        return;
      }

      setFloatingPlayerLayout(
        clampFloatingPlayerLayout(floatingLayoutRef.current, window.innerWidth, window.innerHeight),
      );
    }

    window.addEventListener("resize", handleViewportResize);

    return () => {
      window.removeEventListener("resize", handleViewportResize);
    };
  }, [floatingLayout]);

  useEffect(() => {
    syncBrowserState();
  }, [detachedSession, floatingLayout, isDetachedWindow, isDocumentPictureInPictureMode]);

  useEffect(() => {
    if (!detachedSession) {
      return;
    }

    const detachedSessionId = detachedSession.id;

    function handleStorage(event: StorageEvent) {
      if (!event.key || event.key !== "tv-dash:floating-player-sessions") {
        return;
      }

      const nextSession = getFloatingPlayerSession(detachedSessionId);

      if (!nextSession) {
        detachedWindowRef.current = null;
        setDetachedFloatingSession(null);
        setStatusDetail("Detached playback closed. Returned the player to the page.");
        showControls();
        return;
      }

      setDetachedFloatingSession(nextSession);
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [detachedSession]);

  useEffect(() => {
    if (!detachedSession || src === detachedSession.src) {
      return;
    }

    setDetachedFloatingSession(null);
  }, [detachedSession, src]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = playerMuted;
    syncBrowserState();
  }, [playerMuted]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    syncBrowserState();

    const handlePlaybackStarted = () => {
      setIsPaused(false);
      syncBrowserState();
    };
    const handlePlaybackPaused = () => {
      setIsPaused(Boolean(video.currentSrc) && video.paused && !video.ended);
      syncBrowserState();
    };
    const handleVolumeUpdated = () => {
      setVolume(video.volume);
      setPlayerMuted(video.muted);
    };
    const handleTimeRangeUpdated = () => {
      setCurrentTime(video.currentTime);
      setSeekState(getPlayerSeekState(video));
    };
    const handlePictureInPictureUpdated = () => {
      syncBrowserState();
    };
    const handleFullscreenUpdated = () => {
      syncBrowserState();
    };

    video.addEventListener("play", handlePlaybackStarted);
    video.addEventListener("pause", handlePlaybackPaused);
    video.addEventListener("volumechange", handleVolumeUpdated);
    video.addEventListener("timeupdate", handleTimeRangeUpdated);
    video.addEventListener("progress", handleTimeRangeUpdated);
    video.addEventListener("durationchange", handleTimeRangeUpdated);
    video.addEventListener("loadedmetadata", handleTimeRangeUpdated);
    video.addEventListener("seeking", handleTimeRangeUpdated);
    video.addEventListener("seeked", handleTimeRangeUpdated);
    video.addEventListener("enterpictureinpicture", handlePictureInPictureUpdated);
    video.addEventListener("leavepictureinpicture", handlePictureInPictureUpdated);
    document.addEventListener("fullscreenchange", handleFullscreenUpdated);

    return () => {
      video.removeEventListener("play", handlePlaybackStarted);
      video.removeEventListener("pause", handlePlaybackPaused);
      video.removeEventListener("volumechange", handleVolumeUpdated);
      video.removeEventListener("timeupdate", handleTimeRangeUpdated);
      video.removeEventListener("progress", handleTimeRangeUpdated);
      video.removeEventListener("durationchange", handleTimeRangeUpdated);
      video.removeEventListener("loadedmetadata", handleTimeRangeUpdated);
      video.removeEventListener("seeking", handleTimeRangeUpdated);
      video.removeEventListener("seeked", handleTimeRangeUpdated);
      video.removeEventListener("enterpictureinpicture", handlePictureInPictureUpdated);
      video.removeEventListener("leavepictureinpicture", handlePictureInPictureUpdated);
      document.removeEventListener("fullscreenchange", handleFullscreenUpdated);
    };
  }, [effectiveSrc, fullscreenTargetRef]);

  useEffect(() => {
    if (effectiveSrc || !floatingLayoutRef.current) {
      return;
    }

    setFloatingPlayerLayout(null);
  }, [effectiveSrc]);

  useEffect(() => {
    if (effectiveSrc || !isDocumentPictureInPictureMode) {
      return;
    }

    closeDocumentPictureInPictureWindow("Returned the floating player to the page.");
  }, [effectiveSrc, isDocumentPictureInPictureMode]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;

    hasStartedPlaybackRef.current = false;
    wasRecoveringRef.current = false;
    recoveryStateRef.current = {
      networkAttempts: 0,
      mediaAttempts: 0,
    };

    clearRecoveryNoticeTimeout();
    setRecoveryNotice(null);
    setError(null);
    setFailureKind(null);
    setStatusDetail(null);
    setIsPaused(false);
    setSeekState(defaultPlayerSeekState);
    setCurrentTime(0);
    publishQualityOptions([...defaultQualityOptions]);
    stopPlayback();
    teardownVideo(video);

    if (!effectiveSrc) {
      updateStatus("idle");
      syncBrowserState();
      return;
    }

    updateStatus("loading");
    setStatusDetail("Requesting stream manifest...");

    // Control-state changes like mute handoff and quality preference updates must not rebuild playback.
    const isCurrentSession = () => sessionId === sessionIdRef.current;

    const handlePlaying = () => {
      if (!isCurrentSession()) {
        return;
      }

      const recovered = wasRecoveringRef.current;
      hasStartedPlaybackRef.current = true;
      wasRecoveringRef.current = false;
      recoveryStateRef.current = {
        networkAttempts: 0,
        mediaAttempts: 0,
      };

      setError(null);
      setFailureKind(null);
      setStatusDetail(null);
      setIsPaused(false);
      updateStatus("playing");
      syncBrowserState();

      if (recovered) {
        showRecoveryNotice("Stream recovered");
      }
    };

    const handleWaiting = () => {
      if (!isCurrentSession()) {
        return;
      }

      setStatusDetail(hasStartedPlaybackRef.current ? "Buffering live stream..." : "Loading stream...");
      updateStatus(hasStartedPlaybackRef.current ? "buffering" : "loading");
    };

    const handleVideoPause = () => {
      if (!isCurrentSession() || video.ended) {
        return;
      }

      setStatusDetail("Playback paused.");
      updateStatus("playing");
      setIsPaused(true);
    };

    const handleVideoError = () => {
      if (!isCurrentSession()) {
        return;
      }

      clearReconnectTimeout();
      wasRecoveringRef.current = false;
      setStatusDetail(null);
      setError("The browser reported a media playback failure.");
      setFailureKind("media-playback");
      setIsPaused(false);
      updateStatus("error");
    };

    video.addEventListener("playing", handlePlaying);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("stalled", handleWaiting);
    video.addEventListener("pause", handleVideoPause);
    video.addEventListener("error", handleVideoError);

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 1,
        fragLoadingMaxRetry: 1,
      });

      hlsRef.current = hls;
      hls.attachMedia(video);

      const syncManifestLevels = (levels: QualityOption[] | Hls["levels"]) => {
        publishQualityOptions(buildQualityOptions(levels as Hls["levels"]));
        applyPreferredQuality(getStartupPreferredQuality());
      };

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (!isCurrentSession()) {
          return;
        }

        hls?.loadSource(effectiveSrc);
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        if (!isCurrentSession()) {
          return;
        }

        syncManifestLevels(data.levels);
        setStatusDetail("Starting playback...");
        syncBrowserState();

        if (playbackSettingsRef.current.autoPlay) {
          void video.play().catch(() => {
            setStatusDetail("Autoplay was blocked by the browser. Use play to start the stream.");
            updateStatus("playing");
            setIsPaused(true);
          });
        } else {
          updateStatus("playing");
          setIsPaused(true);
        }
      });

      hls.on(Hls.Events.LEVELS_UPDATED, () => {
        if (!isCurrentSession()) {
          return;
        }

        syncManifestLevels(hls?.levels ?? []);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (!isCurrentSession()) {
          return;
        }

        const inAutoMode = selectionModeRef.current === "AUTO";
        callbacksRef.current.onSelectedQualityChange?.(inAutoMode ? "AUTO" : String(data.level));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!isCurrentSession() || !data.fatal || !hls) {
          return;
        }

        clearReconnectTimeout();

        const action = getFatalRecoveryAction(data.type, data.details, recoveryStateRef.current);

        if (action.kind === "retry-network") {
          const activeHls = hls;
          wasRecoveringRef.current = true;
          recoveryStateRef.current.networkAttempts = action.networkAttempts;
          setError(null);
          setFailureKind(action.failureKind);
          setStatusDetail(action.message);
          setIsPaused(false);
          updateStatus("retrying");
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (!isCurrentSession() || hlsRef.current !== activeHls) {
              return;
            }

            setStatusDetail("Retrying stream connection...");
            activeHls.startLoad();
          }, action.delayMs);
          return;
        }

        if (action.kind === "recover-media") {
          wasRecoveringRef.current = true;
          recoveryStateRef.current.mediaAttempts = action.mediaAttempts;
          setError(null);
          setFailureKind(action.failureKind);
          setStatusDetail(action.message);
          setIsPaused(false);
          updateStatus("retrying");
          hls.recoverMediaError();
          return;
        }

        wasRecoveringRef.current = false;
        setStatusDetail(null);
        setError(action.message);
        setFailureKind(action.failureKind);
        setIsPaused(false);
        updateStatus("error");
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      callbacksRef.current.onSelectedQualityChange?.("AUTO");
      video.src = effectiveSrc;
      video.load();
      syncBrowserState();

      if (playbackSettingsRef.current.autoPlay) {
        void video.play().catch(() => {
          setStatusDetail("Autoplay was blocked by the browser. Use play to start the stream.");
          updateStatus("playing");
          setIsPaused(true);
        });
      } else {
        updateStatus("playing");
        setIsPaused(true);
      }
    } else {
      setStatusDetail(null);
      setError("HLS playback is not supported in this browser.");
      setFailureKind("unsupported-stream");
      setIsPaused(false);
      updateStatus("error");
    }

    return () => {
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("stalled", handleWaiting);
      video.removeEventListener("pause", handleVideoPause);
      video.removeEventListener("error", handleVideoError);
      clearReconnectTimeout();

      if (hls) {
        hls.destroy();

        if (hlsRef.current === hls) {
          hlsRef.current = null;
        }
      }
    };
  }, [effectiveSrc, reloadKey]);

  useEffect(() => {
    if (!hlsRef.current) {
      return;
    }

    applyPreferredQuality(preferredQuality);
  }, [preferredQuality]);

  useEffect(() => {
    if (!capabilities.canUseMediaSession || !effectiveSrc) {
      return;
    }

    return syncPlayerMediaSession(
      navigator.mediaSession,
      typeof MediaMetadata === "undefined" ? undefined : MediaMetadata,
      {
        title,
        playbackState: isPaused ? "paused" : status === "playing" || status === "buffering" || status === "retrying" ? "playing" : "none",
        canSeek: seekState.canSeek,
        seekOffsetSeconds: SEEK_STEP_SECONDS,
        onPlay: resumePlayback,
        onPause: () => pausePlayback("Playback paused from a browser media control."),
        onStop: () => pausePlayback("Playback stopped from a browser media control."),
        onSeekBackward: (seekOffsetSeconds) => {
          handleSeek(-seekOffsetSeconds);
        },
        onSeekForward: (seekOffsetSeconds) => {
          handleSeek(seekOffsetSeconds);
        },
      },
    );
  }, [capabilities.canUseMediaSession, effectiveSrc, isPaused, seekState.canSeek, status, title]);

  useEffect(() => () => {
    clearReconnectTimeout();
    clearRecoveryNoticeTimeout();
    clearControlsVisibilityTimeout();
    clearFloatingPlayerInteraction();
    documentPictureInPictureWindowRef.current?.close();
    stopPlayback();
  }, []);

  const detachedRuntimeState = detachedSession?.runtimeState ?? null;
  const diagnostics = buildPlayerDiagnostics({
    status: detachedRuntimeState?.status ?? status,
    statusDetail:
      detachedRuntimeState && !statusDetail
        ? "Playback is running in a detached TV-Dash floating window."
        : statusDetail,
    error,
    failureKind,
    recoveryNotice,
    muted: detachedRuntimeState?.isMuted ?? playerMuted,
    isPaused: detachedRuntimeState?.isPaused ?? isPaused,
    volume: detachedRuntimeState?.volume ?? volume,
    isPictureInPictureActive: isPictureInPictureMode,
    pictureInPictureMode,
    isFullscreenActive: detachedRuntimeState?.isFullscreenActive ?? isFullscreenMode,
    canPictureInPicture: capabilities.canPictureInPicture,
    canSeek: detachedRuntimeState?.canSeek ?? seekState.canSeek,
    isAtLiveEdge: detachedRuntimeState?.isAtLiveEdge ?? seekState.isAtLiveEdge,
    liveLatencySeconds: detachedRuntimeState?.liveLatencySeconds ?? seekState.liveLatencySeconds,
  });
  const effectiveCanSeek = detachedRuntimeState?.canSeek ?? seekState.canSeek;
  const effectiveIsAtLiveEdge = detachedRuntimeState?.isAtLiveEdge ?? seekState.isAtLiveEdge;
  const effectiveLiveLatencySeconds = detachedRuntimeState?.liveLatencySeconds ?? seekState.liveLatencySeconds;
  const liveStateLabel = effectiveCanSeek
    ? effectiveIsAtLiveEdge
      ? "Live"
      : `-${Math.round(effectiveLiveLatencySeconds ?? 0)}s`
    : "No DVR";
  const timelineMin = seekState.rangeStart ?? 0;
  const timelineMax = seekState.rangeEnd ?? 1;
  const timelineValue = effectiveCanSeek
    ? Math.min(timelineMax, Math.max(timelineMin, currentTime))
    : timelineMax;
  const currentTimeLabel = effectiveCanSeek
    ? formatPlaybackTime(currentTime - timelineMin)
    : liveStateLabel;
  const durationLabel = effectiveCanSeek
    ? formatPlaybackTime((seekState.rangeEnd ?? timelineMax) - timelineMin)
    : "LIVE";
  const showCenterPlaybackButton = Boolean(effectiveSrc) && (areControlsVisible || isPaused);

  function renderPlayerSurface() {
    return (
      <div
        ref={playerFrameRef}
        className={cn("relative h-full overflow-hidden rounded-[1.1rem] bg-black", className)}
        data-testid="player-surface"
        onBlur={handleBlurWithin}
        onFocus={handleFocusWithin}
        onMouseDown={floatingLayout ? bringFloatingPlayerToFront : undefined}
        onMouseEnter={handlePointerEnter}
        onMouseLeave={handlePointerLeave}
        onMouseMove={handlePointerMove}
      >
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted={playerMuted} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />

        {floatingLayout ? (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-12 bg-gradient-to-b from-slate-950/85 via-slate-950/35 to-transparent" />
            <div
              className={cn(
                "absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-2 px-3 py-2 transition-opacity duration-200",
                areControlsVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <button
                aria-label="Drag floating player"
                className="flex min-w-0 cursor-grab items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-[11px] font-medium text-slate-200 shadow-sm active:cursor-grabbing"
                onPointerDown={(event) => startFloatingPlayerInteraction("drag", event)}
                type="button"
              >
                <GripHorizontal className="h-3.5 w-3.5 text-slate-400" />
                <span className="truncate">{title}</span>
              </button>
              <Button
                aria-label="Return floating player to page"
                className="h-8 w-8 rounded-full border border-slate-700/80 bg-slate-950/85"
                onClick={() => closeFloatingPlayer()}
                size="icon-sm"
                title="Return floating player to page"
                type="button"
                variant="secondary"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : null}

        <div
          data-testid="player-status-chrome"
          className={cn(
            "pointer-events-none absolute left-2.5 top-2.5 z-20 flex flex-wrap items-center gap-1.5 transition-opacity duration-200",
            areControlsVisible ? "opacity-100" : "opacity-0",
          )}
        >
          <Badge className="border-cyan-400/30 bg-slate-950/80 text-cyan-100" size="sm">
            <Signal className="mr-2 h-3.5 w-3.5" />
            {title}
          </Badge>
          <Badge
            size="sm"
            className={cn(
              diagnostics.isPaused && "border-slate-700/80 bg-slate-950/80 text-slate-100",
              status === "playing" && !diagnostics.isPaused && "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
              (status === "loading" || status === "buffering") && "border-amber-400/30 bg-amber-500/10 text-amber-100",
              status === "retrying" && "border-amber-400/30 bg-amber-500/10 text-amber-100",
              status === "error" && "border-rose-400/30 bg-rose-500/10 text-rose-100",
            )}
          >
            {diagnostics.label}
          </Badge>
          <Badge className="border-slate-700/80 bg-slate-950/80 text-slate-200" size="sm">
            {liveStateLabel}
          </Badge>
          {diagnostics.isMuted ? <Badge size="sm">Muted</Badge> : null}
          {pictureInPictureMode === "native" ? <Badge size="sm">PiP</Badge> : null}
          {pictureInPictureMode === "floating" ? <Badge size="sm">Floating</Badge> : null}
          {pictureInPictureMode === "detached" ? <Badge size="sm">Detached</Badge> : null}
          {diagnostics.isFullscreenActive ? <Badge size="sm">Fullscreen</Badge> : null}
          {recoveryNotice ? (
            <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200" size="sm">{recoveryNotice}</Badge>
          ) : null}
        </div>

        {showCenterPlaybackButton ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <Button
              aria-label={isPaused ? "Resume playback" : "Pause playback"}
              className="pointer-events-auto h-12 w-12 rounded-full border border-white/20 bg-slate-950/78 text-white shadow-[0_16px_40px_rgba(2,6,23,0.45)] backdrop-blur-sm hover:bg-slate-900/90"
              onClick={handleTogglePlayback}
              size="icon-md"
              title={isPaused ? "Resume playback" : "Pause playback"}
              type="button"
              variant="ghost"
            >
              {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </Button>
          </div>
        ) : null}

        {status === "loading" || status === "buffering" || status === "retrying" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl border border-slate-700/70 bg-slate-950/80 px-3 py-2 text-[13px] text-slate-200">
              <div className="flex items-center gap-1.5">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                {diagnostics.summary}
              </div>
            </div>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-3">
            <div className="max-w-xs rounded-[1.25rem] border border-rose-500/20 bg-slate-950/90 p-4 text-center shadow-glow">
              <AlertTriangle className="mx-auto h-6 w-6 text-rose-300" />
              <p className="mt-2 font-semibold text-white">Playback interrupted</p>
              <p className="mt-1.5 text-[13px] leading-5 text-slate-400">{diagnostics.summary}</p>
              {diagnostics.technicalDetail ? (
                <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-500">{diagnostics.technicalDetail}</p>
              ) : null}
              <Button className="mt-3" onClick={() => setReloadKey((value) => value + 1)} size="sm" type="button" variant="secondary">
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        <PlayerControlOverlay
          canFullscreen={capabilities.canFullscreen}
          canNativePictureInPicture={capabilities.canNativePictureInPicture}
          canOpenFloatingPlayback={
            floatingEnvironment === "main-app" &&
            (capabilities.canDetachedFloatingPlayback || capabilities.canFloatingPlayback || Boolean(detachedSession))
          }
          canSeek={effectiveCanSeek}
          currentTimeLabel={currentTimeLabel}
          density={controlDensity}
          durationLabel={durationLabel}
          floatingPlaybackMode={detachedSession ? "detached" : floatingLayout ? "overlay" : "none"}
          floatingPlaybackUnavailableReason={capabilities.floatingPlaybackUnavailableReason}
          hasSource={Boolean(effectiveSrc)}
          isFullscreenActive={diagnostics.isFullscreenActive}
          isMuted={diagnostics.isMuted}
          isNativePictureInPictureActive={pictureInPictureMode === "native"}
          liveStateLabel={liveStateLabel}
          onJumpToLive={handleJumpToLive}
          onSeekBackward={() => handleSeek(-SEEK_STEP_SECONDS)}
          onSeekForward={() => handleSeek(SEEK_STEP_SECONDS)}
          onToggleFloatingPlayback={handleToggleFloatingPlayback}
          onTimelineChange={handleSeekTo}
          onToggleFullscreen={() => void handleToggleFullscreen()}
          onToggleMute={handleToggleMute}
          onToggleNativePictureInPicture={() => void handleToggleNativePictureInPicture()}
          onVolumeChange={handleVolumeChange}
          nativePictureInPictureUnavailableReason={capabilities.pictureInPictureUnavailableReason}
          showFloatingPlaybackButton={floatingEnvironment === "main-app"}
          timelineMax={timelineMax}
          timelineMin={timelineMin}
          timelineValue={timelineValue}
          visible={areControlsVisible}
          volume={volume}
        />
        {floatingLayout ? (
          <button
            aria-label="Resize floating player"
            className={cn(
              "absolute bottom-2 right-2 z-40 h-4 w-4 cursor-se-resize rounded-sm border border-slate-700/80 bg-slate-950/75 transition-opacity duration-200",
              areControlsVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
            onPointerDown={(event) => startFloatingPlayerInteraction("resize", event)}
            type="button"
          />
        ) : null}
      </div>
    );
  }

  return (
    <>
      {isDocumentPictureInPictureMode ? (
        <div
          className="flex h-full min-h-[160px] items-center justify-center rounded-[1rem] border border-dashed border-cyan-400/30 bg-slate-950/70 p-4 text-center"
          data-testid="document-picture-in-picture-placeholder"
        >
          <div>
            <p className="text-sm font-semibold text-white">Playing in compact floating window</p>
            <p className="mt-1.5 text-[12px] text-slate-400">
              TV-Dash moved the player into a browser floating window without the normal address bar chrome.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button onClick={focusDocumentPictureInPictureWindow} size="sm" type="button" variant="secondary">
                Focus window
              </Button>
              <Button onClick={() => closeDocumentPictureInPictureWindow()} size="sm" type="button" variant="secondary">
                Return to page
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {detachedSession ? (
        <div
          className="flex h-full min-h-[160px] items-center justify-center rounded-[1rem] border border-dashed border-cyan-400/30 bg-slate-950/70 p-4 text-center"
          data-testid="detached-player-placeholder"
        >
          <div>
            <p className="text-sm font-semibold text-white">Playing in detached window</p>
            <p className="mt-1.5 text-[12px] text-slate-400">
              {detachedRuntimeState?.status === "playing"
                ? "The detached TV-Dash window is live and under app-managed control."
                : "This stream is running in a detached TV-Dash floating window."}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button onClick={focusDetachedPlayerWindow} size="sm" type="button" variant="secondary">
                Focus window
              </Button>
              <Button onClick={() => returnDetachedPlayerToPage()} size="sm" type="button" variant="secondary">
                Return to page
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {floatingLayout ? (
        <div
          className="flex h-full min-h-[160px] items-center justify-center rounded-[1rem] border border-dashed border-cyan-400/30 bg-slate-950/70 p-4 text-center"
          data-testid="floating-player-placeholder"
        >
          <div>
            <p className="text-sm font-semibold text-white">Playing in floating mode</p>
            <p className="mt-1.5 text-[12px] text-slate-400">
              Native PiP stayed available for other players, so this stream is floating inside TV-Dash.
            </p>
            <Button className="mt-3" onClick={() => closeFloatingPlayer()} size="sm" type="button" variant="secondary">
              Return to page
            </Button>
          </div>
        </div>
      ) : null}

      <div
        className={cn("h-full w-full", (detachedSession || floatingLayout || isDocumentPictureInPictureMode) && "hidden")}
        ref={setInlineSurfaceAnchor}
      />

      {!detachedSession && surfacePortalHost ? createPortal(renderPlayerSurface(), surfacePortalHost) : null}
    </>
  );
}
