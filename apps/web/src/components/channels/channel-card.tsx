import { Heart, LayoutTemplate, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { ChannelGuideCard } from "@/components/channels/channel-guide-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { getPlaybackModeShortLabel } from "@/lib/playback-mode";
import type { Channel, ChannelNowNext } from "@/types/api";
import { cn } from "@/lib/utils";

export function ChannelCard({
  channel,
  guide,
  isFavorite,
  onToggleFavorite,
}: {
  channel: Channel;
  guide?: ChannelNowNext | null;
  isFavorite: boolean;
  onToggleFavorite: (channel: Channel) => void;
}) {
  return (
    <Panel className="flex h-full flex-col gap-3 p-3" density="compact">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950">
            {channel.logoUrl ? (
              <img alt={channel.name} className="h-full w-full object-cover" src={channel.logoUrl} />
            ) : (
              <span className="text-xs uppercase tracking-[0.28em] text-slate-500">TV</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{channel.name}</p>
            <p className="text-[13px] text-slate-400">{channel.group?.name ?? "Ungrouped"}</p>
          </div>
        </div>
        <button
          className={cn(
            "rounded-xl border px-2 py-1.5 transition",
            isFavorite
              ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
              : "border-slate-700/70 bg-slate-950/70 text-slate-400 hover:text-white",
          )}
          onClick={() => onToggleFavorite(channel)}
          type="button"
        >
          <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge className={channel.isActive ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : ""} size="sm">
          {channel.isActive ? "Active" : "Inactive"}
        </Badge>
        <Badge size="sm">{channel.slug}</Badge>
        <Badge size="sm">{getPlaybackModeShortLabel(channel.playbackMode)}</Badge>
        {channel.epgSource ? <Badge size="sm">{channel.epgSource.name}</Badge> : null}
      </div>

      <ChannelGuideCard guide={guide} hasEpgSource={Boolean(channel.epgSource || channel.hasManualPrograms)} />

      <div className="mt-auto flex flex-wrap gap-2">
        <Link className="min-w-[9rem] flex-1" to={`/watch/${channel.slug}`}>
          <Button className="w-full" size="sm">
            <PlayCircle className="h-4 w-4" />
            Watch
          </Button>
        </Link>
        <Link className="min-w-[9rem] flex-1" to={`/multiview?channels=${channel.id}`}>
          <Button className="w-full" size="sm" variant="secondary">
            <LayoutTemplate className="h-4 w-4" />
            Multi-View
          </Button>
        </Link>
      </div>
    </Panel>
  );
}
