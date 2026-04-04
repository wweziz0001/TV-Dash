import { useRef, useState, type DragEvent } from "react";
import {
  CalendarClock,
  Focus,
  GripVertical,
  Maximize2,
  Search,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ChannelGuideCard } from "@/components/channels/channel-guide-card";
import { cn } from "@/lib/utils";
import { HlsPlayer, type PlayerDiagnostics, type PlayerStatus } from "@/player/hls-player";
import type { Channel, ChannelNowNext, QualityOption, RecordingJob } from "@/types/api";
import { getPlaybackTone } from "./playback-diagnostics";
import type { LayoutDefinition } from "./layouts";
import type { TileState } from "./multiview-layout";

interface MultiviewTileCardProps {
  tileIndex: number;
  tile: TileState;
  channel: Channel | null;
  src: string | null;
  guide: ChannelNowNext | null | undefined;
  guideLoading: boolean;
  qualityOptions: QualityOption[];
  playerStatus: PlayerStatus;
  playerDiagnostics: PlayerDiagnostics;
  layoutDefinition: LayoutDefinition;
  isFocused: boolean;
  isPickerTarget: boolean;
  isDragging: boolean;
  isDragTarget: boolean;
  canDragSwap: boolean;
  recordingJob?: RecordingJob | null;
  onFocus: () => void;
  onToggleAudio: () => void;
  onToggleRecording?: () => void;
  onOpenPicker: () => void;
  onClear: () => void;
  onPreferredQualityChange: (value: string) => void;
  onQualityOptionsChange: (options: QualityOption[]) => void;
  onSelectedQualityChange: (value: string) => void;
  onStatusChange: (status: PlayerStatus) => void;
  onDiagnosticsChange: (diagnostics: PlayerDiagnostics) => void;
  onFullscreen: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

export function MultiviewTileCard({
  tileIndex,
  tile,
  channel,
  src,
  guide,
  guideLoading,
  qualityOptions,
  playerStatus,
  playerDiagnostics,
  layoutDefinition,
  isFocused,
  isPickerTarget,
  isDragging,
  isDragTarget,
  canDragSwap,
  recordingJob = null,
  onFocus,
  onToggleAudio,
  onToggleRecording = () => undefined,
  onOpenPicker,
  onClear,
  onPreferredQualityChange,
  onQualityOptionsChange,
  onSelectedQualityChange,
  onStatusChange,
  onDiagnosticsChange,
  onFullscreen,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: MultiviewTileCardProps) {
  const statusBadgeClassName = getStatusBadgeClassName(playerDiagnostics);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const controlDensity = layoutDefinition.tileCount >= 9 ? "micro" : layoutDefinition.tileCount >= 4 ? "compact" : "full";

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-[1.15rem] border p-2.5 shadow-glow transition",
        tile.isMuted ? "border-slate-800/80 bg-slate-950/70" : "border-cyan-400/20 bg-cyan-500/5",
        isFocused && "border-cyan-300/70 ring-1 ring-cyan-300/30",
        isPickerTarget && "border-amber-300/60 ring-1 ring-amber-300/30",
        isDragTarget && "border-dashed border-cyan-200/70 bg-cyan-400/10",
        isDragging && "opacity-60",
        playerStatus === "error" && "border-rose-400/40 bg-rose-500/5",
        layoutDefinition.tileClassNames[tileIndex],
      )}
      onClick={onFocus}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge size="sm">T {tileIndex + 1}</Badge>
            <p className="truncate text-[13px] font-semibold text-white">{channel?.name ?? `Tile ${tileIndex + 1}`}</p>
            <Badge className={statusBadgeClassName} size="sm">{playerDiagnostics.label}</Badge>
            {playerDiagnostics.recoveryState === "recovered" ? <Badge className="text-emerald-200" size="sm">Recovered</Badge> : null}
            {tile.isMuted ? <Badge size="sm">Muted</Badge> : <Badge className="text-emerald-200" size="sm">Audio</Badge>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {channel?.group?.name ?? "No channel selected"} · {channel ? (channel.playbackMode === "PROXY" ? "Proxy" : "Direct") : "Ready for assignment"}
          </p>
          {channel ? (
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {playerDiagnostics.summary}
            </p>
          ) : null}
        </div>

        {canDragSwap ? (
          <div
            aria-label="Drag to swap tile positions"
            className="hidden h-[1.875rem] w-[1.875rem] cursor-move items-center justify-center rounded-lg border border-slate-800/80 bg-slate-950/70 text-slate-400 sm:flex"
            draggable
            onDragStart={onDragStart}
            title="Drag to swap tile positions"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        ) : null}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <Button onClick={onOpenPicker} size="sm" type="button" variant={channel ? "secondary" : "primary"}>
          <Search className="h-4 w-4" />
          {channel ? "" : ""}
        </Button>
        <Button aria-label={tile.isMuted ? "Unmute tile audio" : "Mute tile audio"} onClick={onToggleAudio} size="icon-sm" type="button" variant={tile.isMuted ? "secondary" : "primary"}>
          {tile.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <Button
          aria-label={recordingJob?.status === "RECORDING" ? "Stop recording" : "Start recording now"}
          disabled={!channel}
          onClick={onToggleRecording}
          size="sm"
          type="button"
          variant={recordingJob?.status === "RECORDING" ? "primary" : "secondary"}
        >
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${recordingJob?.status === "RECORDING" ? "bg-rose-300" : "bg-slate-300"}`}
          />
          {recordingJob?.status === "RECORDING" ? "Stop" : "REC"}
        </Button>
        <Button
          aria-label={isGuideOpen ? "Hide now and next guide" : "Show now and next guide"}
          aria-pressed={isGuideOpen}
          disabled={!channel}
          onClick={() => setIsGuideOpen((current) => !current)}
          size="icon-sm"
          title={isGuideOpen ? "Hide now and next guide" : "Show now and next guide"}
          type="button"
          variant={isGuideOpen ? "primary" : "secondary"}
        >
          <CalendarClock className="h-4 w-4" />
        </Button>
        <Button aria-label={isFocused ? "Focused tile" : "Focus tile"} onClick={onFocus} size="icon-sm" type="button" variant={isFocused ? "primary" : "secondary"}>
          <Focus className="h-4 w-4" />
        </Button>
        <Button aria-label="Fullscreen tile" onClick={onFullscreen} size="icon-sm" type="button" variant="secondary">
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button aria-label="Clear tile" disabled={!channel} onClick={onClear} size="icon-sm" type="button" variant="ghost">
          <X className="h-4 w-4" />
        </Button>
        <div className="flex w-full items-center gap-1.5 rounded-xl border border-slate-800/80 bg-slate-950/70 px-2.5 py-1 sm:ml-auto sm:w-1 sm:min-w-[68px] sm:rounded-lg sm:px-0 sm:py-0">
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500"></span>
          <Select
            className="h-7 border-0 bg-transparent px-0 text-[11px] focus:border-transparent sm:h-6"
            disabled={!channel}
            onChange={(event) => onPreferredQualityChange(event.target.value)}
            uiSize="sm"
            value={channel ? tile.preferredQuality : "AUTO"}
          >
            {qualityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isGuideOpen ? (
        <div className="mb-2">
          <ChannelGuideCard
            guide={guide}
            hasEpgSource={Boolean(channel?.epgSource || channel?.hasManualPrograms)}
            isLoading={guideLoading}
            variant="compact"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1" ref={playerFrameRef}>
        {channel ? (
          <HlsPlayer
            autoPlay
            controlDensity={controlDensity}
            fullscreenTargetRef={playerFrameRef}
            initialBias={tile.isMuted ? "LOWEST" : "AUTO"}
            muted={tile.isMuted}
            onMutedChange={(nextMuted) => {
              if (nextMuted !== tile.isMuted) {
                onToggleAudio();
              }
            }}
            onQualityOptionsChange={onQualityOptionsChange}
            onSelectedQualityChange={onSelectedQualityChange}
            onStatusChange={onStatusChange}
            onDiagnosticsChange={onDiagnosticsChange}
            preferredQuality={tile.preferredQuality}
            src={src}
            title={channel.name}
          />
        ) : (
          <div className="flex h-full min-h-[180px] items-center justify-center rounded-[1rem] border border-dashed border-slate-700/80 bg-black/30 p-4 text-center">
            <div>
              <p className="text-sm font-semibold text-white">Empty tile</p>
              <p className="mt-1.5 text-[13px] text-slate-400">
                Assign a channel or press <span className="font-mono text-slate-300">C</span> to open the picker for this tile.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getStatusBadgeClassName(diagnostics: PlayerDiagnostics) {
  const tone = getPlaybackTone(diagnostics);

  if (tone === "success") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  }

  if (tone === "warning") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  if (tone === "danger") {
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  }

  return "border-slate-700/80 bg-slate-900/80 text-slate-200";
}
