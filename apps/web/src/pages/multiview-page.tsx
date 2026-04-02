import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Focus, LayoutTemplate, Maximize2, Save, Trash2, Volume2, VolumeX } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import type { LayoutType } from "@tv-dash/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import { HlsPlayer, type PlayerStatus } from "@/player/hls-player";
import { getLayoutDefinition, layoutDefinitions } from "@/player/layouts";
import { enforceSingleActiveAudio, resizeTiles, type TileState } from "@/player/multiview-layout";
import {
  hydrateMultiviewLayout,
  pruneTileScopedState,
  replaceTileChannel,
  resetTileQualityOptions,
  serializeMultiviewLayout,
  setTilePreferredQuality,
  setTileQualityOptions,
} from "@/player/multiview-state";
import { defaultQualityOptions } from "@/player/quality-options";
import { api } from "@/services/api";
import type { QualityOption } from "@/types/api";

export function MultiViewPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialChannelsApplied = useRef(false);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [layoutType, setLayoutType] = useState<LayoutType>("LAYOUT_2X2");
  const [layoutName, setLayoutName] = useState("Ops Layout");
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [focusedTileIndex, setFocusedTileIndex] = useState(0);
  const [tiles, setTiles] = useState<TileState[]>(resizeTiles("LAYOUT_2X2", [], { ensureAudioOwner: true }));
  const [qualityOptionsByTile, setQualityOptionsByTile] = useState<Record<number, QualityOption[]>>({});
  const [playerStatusByTile, setPlayerStatusByTile] = useState<Record<number, PlayerStatus>>({});

  const channelsQuery = useQuery({
    queryKey: ["channels", token],
    queryFn: async () => (await api.listChannels(token)).channels,
    enabled: Boolean(token),
  });

  const layoutsQuery = useQuery({
    queryKey: ["layouts", token],
    queryFn: async () => (await api.listLayouts(token!)).layouts,
    enabled: Boolean(token),
  });

  useEffect(() => {
    setTiles((current) => resizeTiles(layoutType, current, { ensureAudioOwner: true }));
    setQualityOptionsByTile((current) => pruneTileScopedState(current, getLayoutDefinition(layoutType).tileCount));
    setPlayerStatusByTile((current) => pruneTileScopedState(current, getLayoutDefinition(layoutType).tileCount));
    setFocusedTileIndex((current) => Math.min(current, getLayoutDefinition(layoutType).tileCount - 1));
  }, [layoutType]);

  useEffect(() => {
    if (!channelsQuery.data || initialChannelsApplied.current) {
      return;
    }

    const seededIds = searchParams.get("channels")?.split(",").filter(Boolean) ?? [];
    const fallbackIds = channelsQuery.data.slice(0, getLayoutDefinition(layoutType).tileCount).map((channel) => channel.id);
    setTiles(resizeTiles(layoutType, [], { ensureAudioOwner: true }).map((tile, index) => ({
      ...tile,
      channelId: (seededIds.length ? seededIds : fallbackIds)[index] ?? null,
    })));
    setFocusedTileIndex(0);
    initialChannelsApplied.current = true;
  }, [channelsQuery.data, layoutType, searchParams]);

  const saveMutation = useMutation({
    mutationFn: async (mode: "create" | "update") => {
      if (!token) {
        throw new Error("Missing session");
      }

      const payload = serializeMultiviewLayout(layoutName, layoutType, tiles, focusedTileIndex);

      if (mode === "update" && selectedLayoutId) {
        return api.updateLayout(selectedLayoutId, payload, token);
      }

      return api.createLayout(payload, token);
    },
    onSuccess: async (response) => {
      const layoutId = "layout" in response ? response.layout.id : null;
      if (layoutId) {
        setSelectedLayoutId(layoutId);
      }
      toast.success(selectedLayoutId ? "Layout updated" : "Layout saved");
      await queryClient.invalidateQueries({ queryKey: ["layouts", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save layout");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!token || !selectedLayoutId) {
        throw new Error("Select a saved layout first");
      }
      await api.deleteLayout(selectedLayoutId, token);
    },
    onSuccess: async () => {
      toast.success("Layout deleted");
      setSelectedLayoutId(null);
      setLayoutName("Ops Layout");
      await queryClient.invalidateQueries({ queryKey: ["layouts", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete layout");
    },
  });

  const layoutDefinition = getLayoutDefinition(layoutType);
  const activeAudioIndex = tiles.findIndex((tile) => !tile.isMuted);

  const savedLayouts = layoutsQuery.data ?? [];
  const channels = channelsQuery.data ?? [];

  const channelMap = useMemo(() => new Map(channels.map((channel) => [channel.id, channel])), [channels]);

  function updateLayoutType(nextValue: string) {
    const nextLayout = layoutDefinitions.find((layout) => layout.type === nextValue);
    if (!nextLayout) {
      return;
    }

    setLayoutType(nextLayout.type);
  }

  function applySavedLayout(layoutId: string) {
    const layout = savedLayouts.find((entry) => entry.id === layoutId);
    if (!layout) {
      return;
    }

    const nextState = hydrateMultiviewLayout(layout);
    setSelectedLayoutId(layout.id);
    setLayoutName(layout.name);
    setLayoutType(layout.layoutType);
    setTiles(nextState.tiles);
    setFocusedTileIndex(nextState.focusedTileIndex);
    setQualityOptionsByTile({});
    setPlayerStatusByTile({});
  }

  function handleChannelChange(tileIndex: number, channelId: string) {
    setTiles((current) => replaceTileChannel(current, tileIndex, channelId || null));
    setQualityOptionsByTile((current) => resetTileQualityOptions(current, tileIndex));
    setPlayerStatusByTile((current) => ({
      ...current,
      [tileIndex]: channelId ? "loading" : "idle",
    }));
  }

  function handleAudioToggle(tileIndex: number) {
    setTiles((current) => enforceSingleActiveAudio(current, tileIndex));
    setFocusedTileIndex(tileIndex);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Multi-View"
        title="Split-screen channel wall"
        description="Run several channels side by side, keep one audio source active, and save layouts for recurring monitoring setups."
        actions={
          <>
            <Button onClick={() => saveMutation.mutate(selectedLayoutId ? "update" : "create")}>
              <Save className="h-4 w-4" />
              {selectedLayoutId ? "Update layout" : "Save layout"}
            </Button>
            <Button onClick={() => deleteMutation.mutate()} variant="secondary">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[0.5fr_0.25fr_0.25fr]">
          <Input onChange={(event) => setLayoutName(event.target.value)} placeholder="Layout name" value={layoutName} />
          <Select onChange={(event) => updateLayoutType(event.target.value)} value={layoutType}>
            {layoutDefinitions.map((layout) => (
              <option key={layout.type} value={layout.type}>
                {layout.label} · {layout.description}
              </option>
            ))}
          </Select>
          <Select onChange={(event) => applySavedLayout(event.target.value)} value={selectedLayoutId ?? ""}>
            <option value="">Apply saved layout</option>
            {savedLayouts.map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.name}
              </option>
            ))}
          </Select>
        </div>
      </PageHeader>

      <Panel>
        <div className={cn("grid gap-4", layoutDefinition.containerClassName)}>
          {tiles.map((tile, index) => {
            const channel = tile.channelId ? channelMap.get(tile.channelId) ?? null : null;
            const qualityOptions = qualityOptionsByTile[index] ?? [...defaultQualityOptions];
            const playerStatus = playerStatusByTile[index] ?? (channel ? "loading" : "idle");
            const isFocused = focusedTileIndex === index;

            return (
              <div
                key={index}
                ref={(element) => {
                  tileRefs.current[index] = element;
                }}
                className={cn(
                  "rounded-[1.9rem] border p-3 shadow-glow transition",
                  tile.isMuted ? "border-slate-800/80 bg-slate-950/70" : "border-cyan-400/20 bg-cyan-500/5",
                  isFocused && "border-cyan-300/70 ring-1 ring-cyan-300/30",
                  playerStatus === "error" && "border-rose-400/40 bg-rose-500/5",
                  layoutDefinition.tileClassNames[index],
                )}
              >
                <div className="mb-3 flex flex-wrap gap-3">
                  <div className="min-w-[220px] flex-1">
                    <Select onChange={(event) => handleChannelChange(index, event.target.value)} value={tile.channelId ?? ""}>
                      <option value="">Select channel</option>
                      {channels.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="min-w-[160px]">
                    <Select
                      disabled={!channel}
                      onChange={(event) => setTiles((current) => setTilePreferredQuality(current, index, event.target.value))}
                      value={channel ? tile.preferredQuality : "AUTO"}
                    >
                      {qualityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button onClick={() => handleAudioToggle(index)} variant={tile.isMuted ? "secondary" : "primary"}>
                    {tile.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    {tile.isMuted ? "Muted" : "Live audio"}
                  </Button>
                  <Button onClick={() => setFocusedTileIndex(index)} variant={isFocused ? "primary" : "secondary"}>
                    <Focus className="h-4 w-4" />
                    {isFocused ? "Focused" : "Focus"}
                  </Button>
                  <Button onClick={() => tileRefs.current[index]?.requestFullscreen?.()} variant="secondary">
                    <Maximize2 className="h-4 w-4" />
                    Fullscreen
                  </Button>
                </div>

                <div className="mb-3 flex flex-wrap items-center justify-between gap-4 text-sm">
                  <div>
                    <p className="font-semibold text-white">{channel?.name ?? `Tile ${index + 1}`}</p>
                    <p className="text-slate-400">{channel?.group?.name ?? "No channel selected"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <div className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-slate-300">
                      {activeAudioIndex === index ? "Audio owner" : tile.isMuted ? "Muted tile" : "All muted"}
                    </div>
                    <div className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-slate-300">
                      {isFocused ? "Focused tile" : "Background tile"}
                    </div>
                    <div className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-slate-300">
                      {channel ? `${playerStatus} · ${tile.preferredQuality}` : "Idle"}
                    </div>
                  </div>
                </div>

                <div className="h-full">
                  <HlsPlayer
                    key={`${index}:${tile.channelId ?? "empty"}`}
                    autoPlay
                    initialBias={tile.isMuted ? "LOWEST" : "AUTO"}
                    muted={tile.isMuted}
                    onQualityOptionsChange={(options) =>
                      setQualityOptionsByTile((current) => setTileQualityOptions(current, index, options))
                    }
                    onSelectedQualityChange={(selectedQuality) =>
                      setTiles((current) => setTilePreferredQuality(current, index, selectedQuality))
                    }
                    onStatusChange={(nextStatus) =>
                      setPlayerStatusByTile((current) => ({
                        ...current,
                        [index]: nextStatus,
                      }))
                    }
                    preferredQuality={tile.preferredQuality}
                    src={channel?.masterHlsUrl ?? null}
                    title={channel?.name ?? `Tile ${index + 1}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center gap-3">
          <LayoutTemplate className="h-5 w-5 text-accent" />
          <div>
            <p className="font-semibold text-white">Wall behavior</p>
            <p className="text-sm text-slate-400">
              Only one tile is unmuted at a time, focused tiles stay visually distinct, and muted background tiles reset
              to low-bias startup quality when their source changes.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
