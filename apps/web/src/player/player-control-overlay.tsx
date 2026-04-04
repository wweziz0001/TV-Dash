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

type PlayerControlDensity = "micro" | "compact" | "full";

interface PlayerControlOverlayProps {
  density?: PlayerControlDensity;
  visible?: boolean;
  hasSource: boolean;
  isPaused: boolean;
  isMuted: boolean;
  volume: number;
  canSeek: boolean;
  liveStateLabel: string;
  timelineValue: number;
  timelineMin: number;
  timelineMax: number;
  currentTimeLabel: string;
  durationLabel: string;
  timelineStatusLabel: string;
  isPictureInPictureActive: boolean;
  isFullscreenActive: boolean;
  canPictureInPicture: boolean;
  pictureInPictureUnavailableReason: string | null;
  canFullscreen: boolean;
  onTogglePlayback: () => void;
  onToggleMute: () => void;
  onVolumeChange: (value: number) => void;
  onSeekBackward: () => void;
  onJumpToLive: () => void;
  onSeekForward: () => void;
  onTimelineChange: (value: number) => void;
  onTogglePictureInPicture: () => void;
  onToggleFullscreen: () => void;
}

export function PlayerControlOverlay({
  density = "full",
  visible = true,
  hasSource,
  isPaused,
  isMuted,
  volume,
  canSeek,
  liveStateLabel,
  timelineValue,
  timelineMin,
  timelineMax,
  currentTimeLabel,
  durationLabel,
  timelineStatusLabel,
  isPictureInPictureActive,
  isFullscreenActive,
  canPictureInPicture,
  pictureInPictureUnavailableReason,
  canFullscreen,
  onTogglePlayback,
  onToggleMute,
  onVolumeChange,
  onSeekBackward,
  onJumpToLive,
  onSeekForward,
  onTimelineChange,
  onTogglePictureInPicture,
  onToggleFullscreen,
}: PlayerControlOverlayProps) {
  const isCompact = density === "compact";
  const isMicro = density === "micro";
  const buttonClassName = isMicro ? "h-7 min-h-7 rounded-md px-1.5 text-[10px]" : "";
  const iconButtonClassName = isMicro ? "h-7 w-7 rounded-md" : "";
  const timelineWrapperClassName = isMicro ? "mb-1.5 rounded-xl px-2 py-1.5" : "mb-2 rounded-2xl px-3 py-2";

  return (
    <div
      data-testid="player-control-overlay"
      className={cn(
        "absolute inset-x-2 bottom-2 rounded-[1rem] border border-slate-700/70 bg-slate-950/88 backdrop-blur-sm transition-opacity duration-200",
        isMicro ? "px-1.5 py-1.5" : isCompact ? "px-2 py-2" : "px-3 py-2.5",
        visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className={cn("border border-slate-800/80 bg-slate-900/75", timelineWrapperClassName)}>
        <div className={cn("flex items-center justify-between gap-2 text-slate-400", isMicro ? "mb-1 text-[9px]" : "mb-1.5 text-[11px]")}>
          <span>{currentTimeLabel}</span>
          <span className={cn("truncate text-center uppercase tracking-[0.18em] text-slate-500", isMicro ? "text-[8px]" : "text-[10px]")}>
            {timelineStatusLabel}
          </span>
          <span>{durationLabel}</span>
        </div>
        <input
          aria-label="Player timeline"
          className={cn(
            "w-full cursor-pointer accent-cyan-300 disabled:cursor-default disabled:opacity-80",
            isMicro ? "h-2" : "h-2.5",
          )}
          disabled={!canSeek || !hasSource}
          max={timelineMax}
          min={timelineMin}
          onChange={(event) => onTimelineChange(Number(event.target.value))}
          step={1}
          type="range"
          value={timelineValue}
        />
      </div>

      <div className={cn("flex items-center gap-2", isMicro || isCompact ? "flex-wrap" : "flex-wrap lg:flex-nowrap")}>
        <div className="flex items-center gap-1.5">
          <Button
            aria-label={isPaused ? "Resume playback" : "Pause playback"}
            disabled={!hasSource}
            className={iconButtonClassName}
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
                className={iconButtonClassName}
                onClick={onSeekBackward}
                size="icon-sm"
                title="Seek backward 10 seconds"
                type="button"
                variant="secondary"
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                aria-label="Jump to live"
                className={buttonClassName}
                onClick={onJumpToLive}
                size="sm"
                title="Jump to live"
                type="button"
                variant={liveStateLabel === "Live" ? "primary" : "secondary"}
              >
                Live
              </Button>
              <Button
                aria-label="Seek forward 10 seconds"
                className={iconButtonClassName}
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
            className={iconButtonClassName}
            onClick={onToggleMute}
            size="icon-sm"
            title={isMuted ? "Unmute audio" : "Mute audio"}
            type="button"
            variant={isMuted ? "secondary" : "primary"}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>

        <label
          className={cn(
            "flex items-center gap-2 text-slate-200",
            isMicro ? "ml-auto w-[96px]" : isCompact ? "ml-auto w-[120px]" : "ml-auto w-[148px]",
          )}
        >
          <span className={cn("uppercase tracking-[0.18em] text-slate-500", isMicro ? "text-[8px]" : "text-[10px]")}>Vol</span>
          <input
            aria-label="Player volume"
            className={cn("w-full cursor-pointer accent-cyan-300", isMicro ? "h-1" : "h-1.5")}
            max={1}
            min={0}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            step={0.05}
            type="range"
            value={Number.isFinite(volume) ? volume : 1}
          />
          <span className={cn("text-right text-slate-400", isMicro ? "w-7 text-[9px]" : "w-9 text-[11px]")}>{Math.round(volume * 100)}%</span>
        </label>

        <div className="flex items-center gap-1.5">
          <span className={cn(
            "rounded-full border border-emerald-400/25 bg-emerald-500/10 font-semibold uppercase tracking-[0.18em] text-emerald-200",
            isMicro ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]",
          )}>
            {liveStateLabel}
          </span>
          <Button
            aria-label={isPictureInPictureActive ? "Exit Picture-in-Picture" : "Open Picture-in-Picture"}
            disabled={!canPictureInPicture || !hasSource}
            className={buttonClassName}
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
            className={iconButtonClassName}
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
