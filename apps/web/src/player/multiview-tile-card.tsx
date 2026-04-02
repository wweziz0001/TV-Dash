import type { DragEvent } from "react";
import {
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
import { HlsPlayer, type PlayerStatus } from "@/player/hls-player";
import type { Channel, ChannelNowNext, QualityOption } from "@/types/api";
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
  layoutDefinition: LayoutDefinition;
  isFocused: boolean;
  isPickerTarget: boolean;
  isDragging: boolean;
  isDragTarget: boolean;
  onFocus: () => void;
  onToggleAudio: () => void;
  onOpenPicker: () => void;
  onClear: () => void;
  onPreferredQualityChange: (value: string) => void;
  onQualityOptionsChange: (options: QualityOption[]) => void;
  onSelectedQualityChange: (value: string) => void;
  onStatusChange: (status: PlayerStatus) => void;
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
  layoutDefinition,
  isFocused,
  isPickerTarget,
  isDragging,
  isDragTarget,
  onFocus,
  onToggleAudio,
  onOpenPicker,
  onClear,
  onPreferredQualityChange,
  onQualityOptionsChange,
  onSelectedQualityChange,
  onStatusChange,
  onFullscreen,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: MultiviewTileCardProps) {
  const statusBadgeClassName = getStatusBadgeClassName(playerStatus);

  return (
    <div
      className={cn(
        "rounded-[1.9rem] border p-3 shadow-glow transition",
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
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white">{channel?.name ?? `Tile ${tileIndex + 1}`}</p>
            <Badge className={statusBadgeClassName}>{playerStatus}</Badge>
            {isFocused ? <Badge className="text-cyan-100">Focused</Badge> : null}
            {tile.isMuted ? <Badge>Muted</Badge> : <Badge className="text-emerald-200">Audio live</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {channel?.group?.name ?? "No channel selected"} · {channel ? (channel.playbackMode === "PROXY" ? "Proxy" : "Direct") : "Ready for assignment"}
          </p>
        </div>

        <div
          className="flex cursor-move items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-xs text-slate-400"
          draggable
          onDragStart={onDragStart}
          title="Drag to swap tile positions"
        >
          <GripVertical className="h-4 w-4" />
          Drag to swap
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button onClick={onOpenPicker} type="button" variant={channel ? "secondary" : "primary"}>
          <Search className="h-4 w-4" />
          {channel ? "Replace" : "Assign"}
        </Button>
        <Button onClick={onToggleAudio} type="button" variant={tile.isMuted ? "secondary" : "primary"}>
          {tile.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {tile.isMuted ? "Muted" : "Audio"}
        </Button>
        <Button onClick={onFocus} type="button" variant={isFocused ? "primary" : "secondary"}>
          <Focus className="h-4 w-4" />
          {isFocused ? "Focused" : "Focus"}
        </Button>
        <Button onClick={onFullscreen} type="button" variant="secondary">
          <Maximize2 className="h-4 w-4" />
          Fullscreen
        </Button>
        <Button disabled={!channel} onClick={onClear} type="button" variant="ghost">
          <X className="h-4 w-4" />
          Clear
        </Button>
      </div>

      <div className="mb-3 grid gap-3 xl:grid-cols-[0.6fr_0.4fr]">
        <ChannelGuideCard
          className="h-full"
          guide={guide}
          hasEpgSource={Boolean(channel?.epgSource)}
          isLoading={guideLoading}
          variant="compact"
        />
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Quality</p>
          <Select
            className="mt-3"
            disabled={!channel}
            onChange={(event) => onPreferredQualityChange(event.target.value)}
            value={channel ? tile.preferredQuality : "AUTO"}
          >
            {qualityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="mt-3 text-xs text-slate-500">
            {tile.isMuted ? "Background tiles stay bandwidth-safe by default." : "Focused listening tile can stay on auto or manual quality."}
          </p>
        </div>
      </div>

      <div className="h-full">
        {channel ? (
          <HlsPlayer
            key={`${tileIndex}:${tile.channelId ?? "empty"}`}
            autoPlay
            initialBias={tile.isMuted ? "LOWEST" : "AUTO"}
            muted={tile.isMuted}
            onQualityOptionsChange={onQualityOptionsChange}
            onSelectedQualityChange={onSelectedQualityChange}
            onStatusChange={onStatusChange}
            preferredQuality={tile.preferredQuality}
            src={src}
            title={channel.name}
          />
        ) : (
          <div className="flex h-full min-h-[260px] items-center justify-center rounded-[1.75rem] border border-dashed border-slate-700/80 bg-black/30 p-6 text-center">
            <div>
              <p className="text-lg font-semibold text-white">Empty tile</p>
              <p className="mt-2 text-sm text-slate-400">
                Assign a channel or press <span className="font-mono text-slate-300">C</span> to open the picker for this tile.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getStatusBadgeClassName(status: PlayerStatus) {
  if (status === "playing") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  }

  if (status === "retrying") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  if (status === "loading" || status === "buffering") {
    return "border-sky-400/30 bg-sky-500/10 text-sky-100";
  }

  if (status === "error") {
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  }

  return "";
}
