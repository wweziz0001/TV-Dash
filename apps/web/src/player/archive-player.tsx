import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ArchivePlayerProps {
  src: string | null;
  title: string;
  mediaType: "HLS" | "FILE";
  posterUrl?: string | null;
  initialSeekSeconds?: number;
  autoPlay?: boolean;
  className?: string;
}

export function ArchivePlayer({
  src,
  title,
  mediaType,
  posterUrl = null,
  initialSeekSeconds = 0,
  autoPlay = true,
  className,
}: ArchivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pendingInitialSeekRef = useRef<number>(initialSeekSeconds);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    pendingInitialSeekRef.current = initialSeekSeconds;
  }, [initialSeekSeconds, src]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const applyInitialSeek = () => {
      const seekSeconds = pendingInitialSeekRef.current;

      if (!Number.isFinite(seekSeconds) || seekSeconds <= 0 || !Number.isFinite(video.duration)) {
        return;
      }

      video.currentTime = Math.max(0, Math.min(seekSeconds, video.duration));
      pendingInitialSeekRef.current = 0;
    };

    const handleLoadedMetadata = () => {
      applyInitialSeek();
      setStatus("ready");
    };
    const handlePlaying = () => {
      setStatus("ready");
      setErrorMessage(null);
    };
    const handleError = () => {
      setStatus("error");
      setErrorMessage("Archive playback could not be started for this source.");
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.pause();
    video.removeAttribute("src");
    video.load();

    if (!src) {
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    if (mediaType === "FILE") {
      video.src = src;
      video.load();

      if (autoPlay) {
        void video.play().catch(() => {
          setStatus("ready");
        });
      }

      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });

      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(src);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) {
          void video.play().catch(() => {
            setStatus("ready");
          });
        }
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) {
          return;
        }

        setStatus("error");
        setErrorMessage("Archive playback failed while loading the HLS stream.");
      });

      return () => {
        hls.destroy();
        if (hlsRef.current === hls) {
          hlsRef.current = null;
        }
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.load();

      if (autoPlay) {
        void video.play().catch(() => {
          setStatus("ready");
        });
      }

      return;
    }

    setStatus("error");
    setErrorMessage("This browser cannot play the retained DVR archive stream.");
  }, [autoPlay, mediaType, src]);

  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  return (
    <div className={cn("relative h-full overflow-hidden rounded-[1.1rem] bg-black", className)}>
      <video
        ref={videoRef}
        aria-label={title}
        className="h-full w-full object-contain"
        controls
        playsInline
        poster={posterUrl ?? undefined}
      />

      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/85 px-3 py-2 text-[13px] text-slate-100">
            <div className="flex items-center gap-1.5">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Loading archive playback...
            </div>
          </div>
        </div>
      ) : null}

      {status === "error" && errorMessage ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 px-4">
          <div className="max-w-sm rounded-2xl border border-rose-500/20 bg-slate-950/90 p-4 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-rose-300" />
            <p className="mt-2 text-sm font-semibold text-white">Archive playback failed</p>
            <p className="mt-1.5 text-[13px] text-slate-400">{errorMessage}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

