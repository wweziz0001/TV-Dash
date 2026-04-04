import { useEffect, useRef, useState, type FocusEvent, type RefObject } from "react";
import Hls from "hls.js";
import { AlertTriangle, LoaderCircle, RotateCcw, Signal } from "lucide-react";
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
import { buildPlayerDiagnostics, type PlayerDiagnostics } from "./playback-diagnostics";
import { PlayerControlOverlay } from "./player-control-overlay";
import { getFatalRecoveryAction, type PlayerFailureKind, type PlayerStatus } from "./playback-recovery";
import { buildQualityOptions, defaultQualityOptions, resolvePreferredQuality } from "./quality-options";

interface HlsPlayerProps {
  src: string | null;
  title: string;
  muted?: boolean;
  autoPlay?: boolean;
  preferredQuality?: string | null;
  initialBias?: "AUTO" | "LOWEST";
  className?: string;
  controlDensity?: "compact" | "full";
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
  canUseMediaSession: false,
  pictureInPictureUnavailableReason: "Picture-in-Picture is not supported in this browser.",
};

const SEEK_STEP_SECONDS = 10;

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
  const [isPictureInPictureMode, setIsPictureInPictureMode] = useState(false);
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const [areControlsVisible, setAreControlsVisible] = useState(false);

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

    setCapabilities(getPlayerBrowserCapabilities(video, fullscreenTarget));
    setIsPictureInPictureMode(isPictureInPictureActive(video));
    setIsFullscreenMode(isFullscreenActive(fullscreenTarget));
    setSeekState(getPlayerSeekState(video));

    if (!video) {
      return;
    }

    setCurrentTime(video.currentTime);
    setVolume(video.volume);
    setIsPaused(Boolean(video.currentSrc || src) && video.paused && !video.ended);
  }

  function applyMutedState(nextMuted: boolean) {
    setPlayerMuted(nextMuted);
    callbacksRef.current.onMutedChange?.(nextMuted);
  }

  async function resumePlayback() {
    const video = videoRef.current;

    if (!video || !src) {
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

    if (!video || !src) {
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

  async function handleTogglePictureInPicture() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture?.();
      } else if (capabilities.canPictureInPicture) {
        await video.requestPictureInPicture?.();
      }
    } catch {
      setStatusDetail("Picture-in-Picture could not be opened in this browser session.");
    } finally {
      syncBrowserState();
    }
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
        status,
        statusDetail,
        error,
        failureKind,
        recoveryNotice,
        muted: playerMuted,
        isPaused,
        volume,
        isPictureInPictureActive: isPictureInPictureMode,
        isFullscreenActive: isFullscreenMode,
        canPictureInPicture: capabilities.canPictureInPicture,
        canSeek: seekState.canSeek,
        isAtLiveEdge: seekState.isAtLiveEdge,
        liveLatencySeconds: seekState.liveLatencySeconds,
      }),
    );
  }, [
    capabilities.canPictureInPicture,
    error,
    failureKind,
    isFullscreenMode,
    isPaused,
    isPictureInPictureMode,
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
  }, [fullscreenTargetRef, src]);

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

    if (!src) {
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

        hls?.loadSource(src);
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
      video.src = src;
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
  }, [reloadKey, src]);

  useEffect(() => {
    if (!hlsRef.current) {
      return;
    }

    applyPreferredQuality(preferredQuality);
  }, [preferredQuality]);

  useEffect(() => {
    if (!capabilities.canUseMediaSession || !src) {
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
  }, [capabilities.canUseMediaSession, isPaused, seekState.canSeek, src, status, title]);

  useEffect(() => () => {
    clearReconnectTimeout();
    clearRecoveryNoticeTimeout();
    clearControlsVisibilityTimeout();
    stopPlayback();
  }, []);

  const diagnostics = buildPlayerDiagnostics({
    status,
    statusDetail,
    error,
    failureKind,
    recoveryNotice,
    muted: playerMuted,
    isPaused,
    volume,
    isPictureInPictureActive: isPictureInPictureMode,
    isFullscreenActive: isFullscreenMode,
    canPictureInPicture: capabilities.canPictureInPicture,
    canSeek: seekState.canSeek,
    isAtLiveEdge: seekState.isAtLiveEdge,
    liveLatencySeconds: seekState.liveLatencySeconds,
  });
  const liveStateLabel = seekState.canSeek
    ? seekState.isAtLiveEdge
      ? "Live"
      : `-${Math.round(seekState.liveLatencySeconds ?? 0)}s`
    : "No DVR";
  const timelineMin = seekState.rangeStart ?? 0;
  const timelineMax = seekState.rangeEnd ?? 1;
  const timelineValue = seekState.canSeek
    ? Math.min(timelineMax, Math.max(timelineMin, currentTime))
    : timelineMax;
  const currentTimeLabel = seekState.canSeek
    ? formatPlaybackTime(currentTime - timelineMin)
    : liveStateLabel;
  const durationLabel = seekState.canSeek
    ? formatPlaybackTime((seekState.rangeEnd ?? timelineMax) - timelineMin)
    : "LIVE";
  const timelineStatusLabel = seekState.canSeek
    ? seekState.isAtLiveEdge
      ? "Live edge"
      : `${Math.round(seekState.liveLatencySeconds ?? 0)}s behind live`
    : "Live stream";

  return (
    <div
      ref={playerFrameRef}
      className={cn("relative h-full overflow-hidden rounded-[1.1rem] bg-black", className)}
      onBlur={handleBlurWithin}
      onFocus={handleFocusWithin}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      onMouseMove={handlePointerMove}
    >
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted={playerMuted} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />

      <div
        data-testid="player-status-chrome"
        className={cn(
          "pointer-events-none absolute left-2.5 top-2.5 flex flex-wrap items-center gap-1.5 transition-opacity duration-200",
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
        {playerMuted ? <Badge size="sm">Muted</Badge> : null}
        {isPictureInPictureMode ? <Badge size="sm">PiP</Badge> : null}
        {isFullscreenMode ? <Badge size="sm">Fullscreen</Badge> : null}
        {recoveryNotice ? (
          <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200" size="sm">{recoveryNotice}</Badge>
        ) : null}
      </div>

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
        canPictureInPicture={capabilities.canPictureInPicture}
        canSeek={seekState.canSeek}
        currentTimeLabel={currentTimeLabel}
        density={controlDensity}
        durationLabel={durationLabel}
        hasSource={Boolean(src)}
        isFullscreenActive={isFullscreenMode}
        isMuted={playerMuted}
        isPaused={isPaused}
        isPictureInPictureActive={isPictureInPictureMode}
        liveStateLabel={liveStateLabel}
        onJumpToLive={handleJumpToLive}
        onSeekBackward={() => handleSeek(-SEEK_STEP_SECONDS)}
        onSeekForward={() => handleSeek(SEEK_STEP_SECONDS)}
        onTimelineChange={handleSeekTo}
        onToggleFullscreen={() => void handleToggleFullscreen()}
        onToggleMute={handleToggleMute}
        onTogglePictureInPicture={() => void handleTogglePictureInPicture()}
        onTogglePlayback={handleTogglePlayback}
        onVolumeChange={handleVolumeChange}
        pictureInPictureUnavailableReason={capabilities.pictureInPictureUnavailableReason}
        timelineMax={timelineMax}
        timelineMin={timelineMin}
        timelineStatusLabel={timelineStatusLabel}
        timelineValue={timelineValue}
        visible={areControlsVisible}
        volume={volume}
      />
    </div>
  );
}
