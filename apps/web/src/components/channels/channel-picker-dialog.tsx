import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Channel, ChannelNowNext } from "@/types/api";
import { getChannelGuideState } from "./channel-guide-state";

interface ChannelPickerDialogProps {
  open: boolean;
  title: string;
  description: string;
  channels: Channel[];
  selectedChannelId?: string | null;
  nowNextByChannelId?: Map<string, ChannelNowNext>;
  allowClear?: boolean;
  onClose: () => void;
  onSelect: (channelId: string) => void;
  onClear?: () => void;
}

export function ChannelPickerDialog({
  open,
  title,
  description,
  channels,
  selectedChannelId = null,
  nowNextByChannelId,
  allowClear = false,
  onClose,
  onSelect,
  onClear,
}: ChannelPickerDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }

    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  const filteredChannels = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();

    if (!term) {
      return channels;
    }

    return channels.filter((channel) => {
      return [channel.name, channel.slug, channel.group?.name ?? ""].some((value) => value.toLowerCase().includes(term));
    });
  }, [channels, deferredSearch]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[2rem] border border-slate-800/90 bg-slate-900/95 p-5 shadow-glow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-accent/80">Channel Picker</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm text-slate-400">{description}</p>
          </div>
          <Button onClick={onClose} variant="ghost">
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              ref={inputRef}
              className="pl-11"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by channel, slug, or group"
              value={search}
            />
          </div>
          {allowClear && onClear ? (
            <Button onClick={onClear} variant="secondary">
              Clear tile
            </Button>
          ) : null}
        </div>

        <div className="mt-5 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {filteredChannels.map((channel) => {
            const guideState = getChannelGuideState({
              hasEpgSource: Boolean(channel.epgSource),
              guide: nowNextByChannelId?.get(channel.id),
            });

            return (
              <button
                key={channel.id}
                className={cn(
                  "w-full rounded-[1.5rem] border border-slate-800/80 bg-slate-950/70 p-4 text-left transition hover:border-slate-700 hover:bg-slate-950",
                  selectedChannelId === channel.id && "border-cyan-300/60 bg-cyan-500/5 shadow-[0_0_0_1px_rgba(103,232,249,0.15)]",
                )}
                onClick={() => onSelect(channel.id)}
                type="button"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{channel.name}</p>
                      {selectedChannelId === channel.id ? <Badge className="text-cyan-100">Current</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {channel.group?.name ?? "Ungrouped"} · {channel.slug}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{channel.playbackMode === "PROXY" ? "Proxy" : "Direct"}</Badge>
                    <Badge className={channel.isActive ? "text-emerald-200" : "text-slate-400"}>
                      {channel.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-300">
                  {guideState.kind === "ready"
                    ? `Now: ${guideState.now?.title ?? "Current schedule"}`
                    : guideState.message}
                </p>
                {guideState.kind === "ready" && guideState.next ? (
                  <p className="mt-1 text-xs text-slate-500">Next: {guideState.next.title}</p>
                ) : null}
              </button>
            );
          })}

          {filteredChannels.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-700/80 bg-slate-950/60 p-8 text-center">
              <p className="text-lg font-semibold text-white">No channels matched that search.</p>
              <p className="mt-2 text-sm text-slate-400">Try a channel name, slug, or group instead.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
