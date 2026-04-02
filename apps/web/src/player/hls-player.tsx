import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertTriangle, LoaderCircle, RotateCcw, Signal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QualityOption } from "@/types/api";
import { cn } from "@/lib/utils";
import { getFatalRecoveryAction, type PlayerStatus } from "./playback-recovery";
import { buildQualityOptions, defaultQualityOptions, resolvePreferredQuality } from "./quality-options";

interface HlsPlayerProps {
  src: string | null;
  title: string;
  muted?: boolean;
  autoPlay?: boolean;
  preferredQuality?: string | null;
  initialBias?: "AUTO" | "LOWEST";
  className?: string;
  onQualityOptionsChange?: (options: QualityOption[]) => void;
  onSelectedQualityChange?: (value: string) => void;
  onStatusChange?: (status: PlayerStatus) => void;
}

export type { PlayerStatus } from "./playback-recovery";

export function HlsPlayer({
  src,
  title,
  muted = true,
  autoPlay = true,
  preferredQuality = "AUTO",
  initialBias = "AUTO",
  className,
  onQualityOptionsChange,
  onSelectedQualityChange,
  onStatusChange,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const recoveryNoticeTimeoutRef = useRef<number | null>(null);
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
    onQualityOptionsChange,
    onSelectedQualityChange,
    onStatusChange,
  });

  const [status, setStatus] = useState<PlayerStatus>(src ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  callbacksRef.current = {
    onQualityOptionsChange,
    onSelectedQualityChange,
    onStatusChange,
  };

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

  function showRecoveryNotice(message: string) {
    clearRecoveryNoticeTimeout();
    setRecoveryNotice(message);
    recoveryNoticeTimeoutRef.current = window.setTimeout(() => {
      setRecoveryNotice(null);
      recoveryNoticeTimeoutRef.current = null;
    }, 2200);
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = muted;
  }, [muted]);

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
    setStatusDetail(null);
    publishQualityOptions([...defaultQualityOptions]);
    stopPlayback();
    teardownVideo(video);

    if (!src) {
      updateStatus("idle");
      return;
    }

    updateStatus("loading");
    setStatusDetail("Requesting stream manifest...");

    const isCurrentSession = () => sessionId === sessionIdRef.current;
    const effectivePreferredQuality = initialBias === "LOWEST" && preferredQuality === "AUTO" ? "LOWEST" : preferredQuality;

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
      setStatusDetail(null);
      updateStatus("playing");

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

    const handleVideoError = () => {
      if (!isCurrentSession()) {
        return;
      }

      clearReconnectTimeout();
      wasRecoveringRef.current = false;
      setStatusDetail(null);
      setError("The browser reported a media playback failure.");
      updateStatus("error");
    };

    video.addEventListener("playing", handlePlaying);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("stalled", handleWaiting);
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
        applyPreferredQuality(effectivePreferredQuality);
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

        if (autoPlay) {
          void video.play().catch(() => {
            setStatusDetail("Autoplay was blocked by the browser.");
          });
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
          setStatusDetail(action.message);
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
          setStatusDetail(action.message);
          updateStatus("retrying");
          hls.recoverMediaError();
          return;
        }

        wasRecoveringRef.current = false;
        setStatusDetail(null);
        setError(action.message);
        updateStatus("error");
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      callbacksRef.current.onSelectedQualityChange?.("AUTO");
      video.src = src;
      video.load();

      if (autoPlay) {
        void video.play().catch(() => {
          setStatusDetail("Autoplay was blocked by the browser.");
        });
      }
    } else {
      setStatusDetail(null);
      setError("HLS playback is not supported in this browser.");
      updateStatus("error");
    }

    return () => {
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("stalled", handleWaiting);
      video.removeEventListener("error", handleVideoError);
      clearReconnectTimeout();

      if (hls) {
        hls.destroy();

        if (hlsRef.current === hls) {
          hlsRef.current = null;
        }
      }
    };
  }, [autoPlay, initialBias, reloadKey, src]);

  useEffect(() => {
    if (!hlsRef.current) {
      return;
    }

    applyPreferredQuality(preferredQuality);
  }, [preferredQuality]);

  useEffect(() => () => {
    clearReconnectTimeout();
    clearRecoveryNoticeTimeout();
    stopPlayback();
  }, []);

  return (
    <div className={cn("relative h-full overflow-hidden rounded-[1.1rem] bg-black", className)}>
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted={muted} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

      <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-wrap items-center gap-1.5">
        <Badge className="border-cyan-400/30 bg-slate-950/80 text-cyan-100" size="sm">
          <Signal className="mr-2 h-3.5 w-3.5" />
          {title}
        </Badge>
        <Badge
          size="sm"
          className={cn(
            status === "playing" && "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
            (status === "loading" || status === "buffering") && "border-amber-400/30 bg-amber-500/10 text-amber-100",
            status === "retrying" && "border-amber-400/30 bg-amber-500/10 text-amber-100",
            status === "error" && "border-rose-400/30 bg-rose-500/10 text-rose-100",
          )}
        >
          {status}
        </Badge>
        {recoveryNotice ? (
          <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200" size="sm">{recoveryNotice}</Badge>
        ) : null}
      </div>

      {status === "loading" || status === "buffering" || status === "retrying" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/80 px-3 py-2 text-[13px] text-slate-200">
            <div className="flex items-center gap-1.5">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              {statusDetail ??
                (status === "retrying"
                  ? "Retrying stream connection..."
                  : status === "buffering"
                    ? "Buffering live stream..."
                    : "Loading stream...")}
            </div>
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-3">
          <div className="max-w-xs rounded-[1.25rem] border border-rose-500/20 bg-slate-950/90 p-4 text-center shadow-glow">
            <AlertTriangle className="mx-auto h-6 w-6 text-rose-300" />
            <p className="mt-2 font-semibold text-white">Playback interrupted</p>
            <p className="mt-1.5 text-[13px] leading-5 text-slate-400">{error ?? "The stream could not be recovered."}</p>
            <Button className="mt-3" onClick={() => setReloadKey((value) => value + 1)} size="sm" variant="secondary">
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
