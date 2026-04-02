import { useEffect, useRef, useState } from "react";
import Hls, { type Level } from "hls.js";
import { AlertTriangle, LoaderCircle, RotateCcw, Signal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { QualityOption } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PlayerStatus = "idle" | "loading" | "playing" | "error" | "reconnecting";

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

function buildQualityOptions(levels: Level[]): QualityOption[] {
  const mapped = levels.map((level, index) => ({
    value: String(index),
    label: level.height ? `${level.height}p` : `${Math.round((level.bitrate ?? 0) / 1000)} kbps`,
    height: level.height ?? null,
    bitrate: level.bitrate ?? null,
  }));

  mapped.sort((left, right) => {
    const leftHeight = left.height ?? 0;
    const rightHeight = right.height ?? 0;
    return rightHeight - leftHeight || (right.bitrate ?? 0) - (left.bitrate ?? 0);
  });

  return [{ value: "AUTO", label: "Auto", height: null }, ...mapped];
}

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
  const qualityOptionsRef = useRef<QualityOption[]>([{ value: "AUTO", label: "Auto", height: null }]);
  const selectionModeRef = useRef<"AUTO" | "MANUAL">("AUTO");
  const callbacksRef = useRef({
    onQualityOptionsChange,
    onSelectedQualityChange,
    onStatusChange,
  });

  const [status, setStatus] = useState<PlayerStatus>(src ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
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

  function applyPreferredQuality(requested: string | null | undefined) {
    const hls = hlsRef.current;
    const options = qualityOptionsRef.current;

    if (!hls || options.length <= 1) {
      selectionModeRef.current = "AUTO";
      callbacksRef.current.onSelectedQualityChange?.("AUTO");
      return;
    }

    if (!requested || requested === "AUTO") {
      selectionModeRef.current = "AUTO";
      hls.currentLevel = -1;
      callbacksRef.current.onSelectedQualityChange?.("AUTO");
      return;
    }

    if (requested === "LOWEST") {
      selectionModeRef.current = "MANUAL";
      const lowest = [...options].filter((option) => option.value !== "AUTO").at(-1);
      if (lowest) {
        hls.currentLevel = Number(lowest.value);
        callbacksRef.current.onSelectedQualityChange?.(lowest.value);
      }
      return;
    }

    const option = options.find((entry) => entry.value === requested);
    if (option) {
      selectionModeRef.current = "MANUAL";
      hls.currentLevel = Number(option.value);
      callbacksRef.current.onSelectedQualityChange?.(option.value);
    }
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
    if (!video || !src) {
      updateStatus("idle");
      setError(null);
      return;
    }

    setError(null);
    updateStatus("loading");

    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.pause();
    video.removeAttribute("src");
    video.load();

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 4,
        fragLoadingMaxRetry: 4,
      });

      hlsRef.current = hls;
      hls.attachMedia(video);

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(src);
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const options = buildQualityOptions(data.levels);
        qualityOptionsRef.current = options;
        callbacksRef.current.onQualityOptionsChange?.(options);
        applyPreferredQuality(initialBias === "LOWEST" && preferredQuality === "AUTO" ? "LOWEST" : preferredQuality);

        if (autoPlay) {
          void video.play().catch(() => {
            // Browser autoplay policies can block audio playback. The UI keeps playback muted-safe by default.
          });
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const inAutoMode = selectionModeRef.current === "AUTO" || hls.autoLevelEnabled || hls.currentLevel === -1;
        callbacksRef.current.onSelectedQualityChange?.(inAutoMode ? "AUTO" : String(data.level));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) {
          return;
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          updateStatus("reconnecting");
          reconnectTimeoutRef.current = window.setTimeout(() => {
            hls.startLoad();
          }, 1800);
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          updateStatus("reconnecting");
          hls.recoverMediaError();
          return;
        }

        updateStatus("error");
        setError(data.details);
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      qualityOptionsRef.current = [{ value: "AUTO", label: "Auto", height: null }];
      callbacksRef.current.onQualityOptionsChange?.(qualityOptionsRef.current);
      callbacksRef.current.onSelectedQualityChange?.("AUTO");
      video.src = src;
      if (autoPlay) {
        void video.play().catch(() => {
          // Native playback can still be blocked by autoplay rules.
        });
      }
    } else {
      updateStatus("error");
      setError("HLS playback is not supported in this browser");
    }

    const handlePlaying = () => updateStatus("playing");
    const handleWaiting = () => updateStatus("loading");
    const handleError = () => updateStatus("error");

    video.addEventListener("playing", handlePlaying);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("error", handleError);

      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [autoPlay, initialBias, reloadKey, src]);

  useEffect(() => {
    applyPreferredQuality(preferredQuality);
  }, [preferredQuality]);

  return (
    <div className={cn("relative h-full overflow-hidden rounded-[1.75rem] bg-black", className)}>
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted={muted} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
        <Badge className="border-cyan-400/30 bg-slate-950/80 text-cyan-100">
          <Signal className="mr-2 h-3.5 w-3.5" />
          {title}
        </Badge>
        <Badge
          className={cn(
            status === "playing" && "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
            status === "loading" && "border-amber-400/30 bg-amber-500/10 text-amber-100",
            status === "reconnecting" && "border-amber-400/30 bg-amber-500/10 text-amber-100",
            status === "error" && "border-rose-400/30 bg-rose-500/10 text-rose-100",
          )}
        >
          {status}
        </Badge>
      </div>

      {status === "loading" || status === "reconnecting" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-4 py-3 text-sm text-slate-200">
            <div className="flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {status === "reconnecting" ? "Reconnecting stream..." : "Loading stream..."}
            </div>
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-4">
          <div className="max-w-sm rounded-[1.75rem] border border-rose-500/20 bg-slate-950/90 p-5 text-center shadow-glow">
            <AlertTriangle className="mx-auto h-7 w-7 text-rose-300" />
            <p className="mt-3 font-semibold text-white">Playback interrupted</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{error ?? "The stream could not be recovered."}</p>
            <Button className="mt-4" onClick={() => setReloadKey((value) => value + 1)} variant="secondary">
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
