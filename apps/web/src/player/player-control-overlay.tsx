import {
  Maximize2,
  Minimize2,
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
  isMuted: boolean;
  volume: number;
  canSeek: boolean;
  liveStateLabel: string;
  timelineValue: number;
  timelineMin: number;
  timelineMax: number;
  currentTimeLabel: string;
  durationLabel: string;
  floatingPlaybackMode: "none" | "overlay" | "detached";
  canOpenFloatingPlayback: boolean;
  floatingPlaybackUnavailableReason: string | null;
  showFloatingPlaybackButton?: boolean;
  isNativePictureInPictureActive: boolean;
  isFullscreenActive: boolean;
  canNativePictureInPicture: boolean;
  nativePictureInPictureUnavailableReason: string | null;
  canFullscreen: boolean;
  onToggleFloatingPlayback: () => void;
  onToggleMute: () => void;
  onVolumeChange: (value: number) => void;
  onSeekBackward: () => void;
  onJumpToLive: () => void;
  onSeekForward: () => void;
  onTimelineChange: (value: number) => void;
  onToggleNativePictureInPicture: () => void;
  onToggleFullscreen: () => void;
}

export function PlayerControlOverlay({
  density = "full",
  visible = true,
  hasSource,
  isMuted,
  volume,
  canSeek,
  liveStateLabel,
  timelineValue,
  timelineMin,
  timelineMax,
  currentTimeLabel,
  durationLabel,
  floatingPlaybackMode,
  canOpenFloatingPlayback,
  floatingPlaybackUnavailableReason,
  showFloatingPlaybackButton = true,
  isNativePictureInPictureActive,
  isFullscreenActive,
  canNativePictureInPicture,
  nativePictureInPictureUnavailableReason,
  canFullscreen,
  onToggleFloatingPlayback,
  onToggleMute,
  onVolumeChange,
  onSeekBackward,
  onJumpToLive,
  onSeekForward,
  onTimelineChange,
  onToggleNativePictureInPicture,
  onToggleFullscreen,
}: PlayerControlOverlayProps) {
  const isCompact = density === "compact";
  const isMicro = density === "micro";
  const buttonClassName = isMicro ? "h-7 min-h-7 rounded-md px-1.5 text-[10px]" : "";
  const iconButtonClassName = isMicro ? "h-7 w-7 rounded-md" : "";
  const timelineWrapperClassName = isMicro ? "mb-1 px-1 py-1" : "mb-1.5 px-1 py-1";
  const floatingPlaybackButtonLabel =
    floatingPlaybackMode === "overlay"
      ? "Dock"
      : floatingPlaybackMode === "detached"
        ? "Return"
        : "Float";
  const floatingPlaybackButtonTitle =
    floatingPlaybackMode === "overlay"
      ? "Return the floating player to the page"
      : floatingPlaybackMode === "detached"
        ? "Return playback to the page"
        : floatingPlaybackUnavailableReason ?? "Open a TV-Dash floating player";

  return (
    <div
      data-testid="player-control-overlay"
      className={cn(
        "absolute inset-x-2 bottom-2 transition-opacity duration-200",
        isMicro ? "px-0 py-0" : isCompact ? "px-1 py-1" : "px-2 py-2",
        visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className={timelineWrapperClassName}>
        <div className={cn("flex items-center justify-between gap-2 text-slate-300", isMicro ? "mb-1 text-[8px]" : "mb-1 text-[10px]")}>
          <span>{currentTimeLabel}</span>
          <span>{durationLabel}</span>
        </div>
        <input
          aria-label="Player timeline"
          className={cn(
            "w-full cursor-pointer accent-cyan-300 disabled:cursor-default disabled:opacity-80",
            isMicro ? "h-1" : "h-1.5",
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

      <div className={cn("flex justify-between items-center gap-1", isMicro || isCompact ? "flex-wrap" : "flex-wrap lg:flex-nowrap")}>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full border border-emerald-400/25 bg-emerald-500/10 font-semibold uppercase tracking-[0.18em] text-emerald-200",
              isMicro ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]",
            )}
          >
            {liveStateLabel}
          </span>
          {showFloatingPlaybackButton ? (
            <Button
              aria-label={
                floatingPlaybackMode === "overlay"
                  ? "Return floating player to page"
                  : floatingPlaybackMode === "detached"
                    ? "Return detached player to page"
                    : "Open floating player"
              }
              disabled={!canOpenFloatingPlayback || !hasSource}
              className={buttonClassName}
              onClick={onToggleFloatingPlayback}
              size="sm"
              title={floatingPlaybackButtonTitle}
              type="button"
              variant={floatingPlaybackMode === "none" ? "secondary" : "primary"}
            >
              {floatingPlaybackButtonLabel}
            </Button>
          ) : null}
          {canNativePictureInPicture || isNativePictureInPictureActive ? (
            <Button
              aria-label={isNativePictureInPictureActive ? "Exit browser Picture-in-Picture" : "Open browser Picture-in-Picture"}
              disabled={!canNativePictureInPicture || !hasSource}
              className={buttonClassName}
              onClick={onToggleNativePictureInPicture}
              size="sm"
              title={
                isNativePictureInPictureActive
                  ? "Exit browser Picture-in-Picture"
                  : nativePictureInPictureUnavailableReason ?? "Open browser Picture-in-Picture"
              }
              type="button"
              variant={isNativePictureInPictureActive ? "primary" : "secondary"}
            >
              {isNativePictureInPictureActive ? "Exit PiP" : "PiP"}
            </Button>
          ) : null}
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

        <div className="flex items-center gap-1.5">
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
        </div>

        <div className="flex items-center gap-2 text-slate-200">
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
          <label
            className={cn(
              "flex items-center gap-2 text-slate-200",
              isMicro ? "ml-auto w-[96px]" : isCompact ? "ml-auto w-[120px]" : "ml-auto w-[148px]",
            )}
          >
            <span className={cn("uppercase tracking-[0.18em] text-slate-500", isMicro ? "text-[8px]" : "text-[10px]")}></span>
            <input
              aria-label="Player volume"
              className={cn("w-full cursor-pointer accent-cyan-300", isMicro ? "h-1" : isCompact ? "h-1" : "h-1.5")}
              max={1}
              min={0}
              onChange={(event) => onVolumeChange(Number(event.target.value))}
              step={0.05}
              type="range"
              value={Number.isFinite(volume) ? volume : 1}
            />
            <span className={cn("text-right text-slate-400", isMicro ? "w-7 text-[9px]" : "w-9 text-[11px]")}>{Math.round(volume * 100)}%</span>
          </label>
        </div>
      </div>
    </div>
  );
}
