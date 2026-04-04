import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlayerControlDensity = "compact" | "full";

interface PlayerControlOverlayProps {
  density?: PlayerControlDensity;
  hasSource: boolean;
  isPaused: boolean;
  isMuted: boolean;
  volume: number;
  canSeek: boolean;
  liveStateLabel: string;
  isPictureInPictureActive: boolean;
  isFullscreenActive: boolean;
  canPictureInPicture: boolean;
  pictureInPictureUnavailableReason: string | null;
  canFullscreen: boolean;
  onTogglePlayback: () => void;
  onToggleMute: () => void;
  onVolumeChange: (value: number) => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
  onTogglePictureInPicture: () => void;
  onToggleFullscreen: () => void;
}

export function PlayerControlOverlay({
  density = "full",
  hasSource,
  isPaused,
  isMuted,
  volume,
  canSeek,
  liveStateLabel,
  isPictureInPictureActive,
  isFullscreenActive,
  canPictureInPicture,
  pictureInPictureUnavailableReason,
  canFullscreen,
  onTogglePlayback,
  onToggleMute,
  onVolumeChange,
  onSeekBackward,
  onSeekForward,
  onTogglePictureInPicture,
  onToggleFullscreen,
}: PlayerControlOverlayProps) {
  const isCompact = density === "compact";

  return (
    <div
      className={cn(
        "absolute inset-x-2 bottom-2 pointer-events-auto rounded-[1rem] border border-slate-700/70 bg-slate-950/88 backdrop-blur-sm",
        isCompact ? "px-2 py-2" : "px-3 py-2.5",
      )}
    >
      <div className={cn("flex items-center gap-2", isCompact ? "flex-wrap" : "flex-wrap lg:flex-nowrap")}>
        <div className="flex items-center gap-1.5">
          <Button
            aria-label={isPaused ? "Resume playback" : "Pause playback"}
            disabled={!hasSource}
            onClick={onTogglePlayback}
            size="icon-sm"
            title={isPaused ? "Resume playback" : "Pause playback"}
            type="button"
            variant={isPaused ? "secondary" : "primary"}
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          {canSeek ? (
            <>
              <Button
                aria-label="Seek backward 10 seconds"
                onClick={onSeekBackward}
                size="icon-sm"
                title="Seek backward 10 seconds"
                type="button"
                variant="secondary"
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                aria-label="Seek forward 10 seconds"
                onClick={onSeekForward}
                size="icon-sm"
                title="Seek forward 10 seconds"
                type="button"
                variant="secondary"
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </>
          ) : null}
          <Button
            aria-label={isMuted ? "Unmute audio" : "Mute audio"}
            disabled={!hasSource}
            onClick={onToggleMute}
            size="icon-sm"
            title={isMuted ? "Unmute audio" : "Mute audio"}
            type="button"
            variant={isMuted ? "secondary" : "primary"}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>

        <label className={cn("flex items-center gap-2 text-slate-200", isCompact ? "min-w-[136px] flex-1" : "min-w-[176px] flex-1")}>
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Vol</span>
          <input
            aria-label="Player volume"
            className="h-1.5 w-full cursor-pointer accent-cyan-300"
            max={1}
            min={0}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            step={0.05}
            type="range"
            value={Number.isFinite(volume) ? volume : 1}
          />
          <span className="w-9 text-right text-[11px] text-slate-400">{Math.round(volume * 100)}%</span>
        </label>

        <div className={cn("flex items-center gap-1.5", isCompact ? "ml-auto" : "lg:ml-auto")}>
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            {liveStateLabel}
          </span>
          <Button
            aria-label={isPictureInPictureActive ? "Exit Picture-in-Picture" : "Open Picture-in-Picture"}
            disabled={!canPictureInPicture || !hasSource}
            onClick={onTogglePictureInPicture}
            size="sm"
            title={pictureInPictureUnavailableReason ?? (isPictureInPictureActive ? "Exit Picture-in-Picture" : "Open Picture-in-Picture")}
            type="button"
            variant={isPictureInPictureActive ? "primary" : "secondary"}
          >
            {isPictureInPictureActive ? "Exit PiP" : "PiP"}
          </Button>
          <Button
            aria-label={isFullscreenActive ? "Exit fullscreen" : "Enter fullscreen"}
            disabled={!canFullscreen}
            onClick={onToggleFullscreen}
            size="icon-sm"
            title={isFullscreenActive ? "Exit fullscreen" : "Enter fullscreen"}
            type="button"
            variant={isFullscreenActive ? "primary" : "secondary"}
          >
            {isFullscreenActive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
