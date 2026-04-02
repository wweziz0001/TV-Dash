import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Maximize2, Save, Trash2, Volume2, VolumeX } from "lucide-react";
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
import { HlsPlayer } from "@/player/hls-player";
import { getLayoutDefinition, layoutDefinitions } from "@/player/layouts";
import { buildTileDefaults, enforceSingleActiveAudio, resizeTiles, type TileState } from "@/player/multiview-layout";
import { api } from "@/services/api";
import type { QualityOption, SavedLayoutItem } from "@/types/api";

export function MultiViewPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialChannelsApplied = useRef(false);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [layoutType, setLayoutType] = useState<LayoutType>("LAYOUT_2X2");
  const [layoutName, setLayoutName] = useState("Ops Layout");
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [tiles, setTiles] = useState<TileState[]>(buildTileDefaults("LAYOUT_2X2"));
  const [qualityOptionsByTile, setQualityOptionsByTile] = useState<Record<number, QualityOption[]>>({});

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
    setTiles((current) => resizeTiles(layoutType, current));
  }, [layoutType]);

  useEffect(() => {
    if (!channelsQuery.data || initialChannelsApplied.current) {
      return;
    }

    const seededIds = searchParams.get("channels")?.split(",").filter(Boolean) ?? [];
    const fallbackIds = channelsQuery.data.slice(0, getLayoutDefinition(layoutType).tileCount).map((channel) => channel.id);
    setTiles(buildTileDefaults(layoutType, seededIds.length ? seededIds : fallbackIds));
    initialChannelsApplied.current = true;
  }, [channelsQuery.data, layoutType, searchParams]);

  const saveMutation = useMutation({
    mutationFn: async (mode: "create" | "update") => {
      if (!token) {
        throw new Error("Missing session");
      }

      const payload = {
        name: layoutName,
        layoutType,
        configJson: {
          activeAudioTile: tiles.findIndex((tile) => !tile.isMuted),
        },
        items: tiles.map((tile, index): SavedLayoutItem => ({
          tileIndex: index,
          channelId: tile.channelId,
          preferredQuality: tile.preferredQuality,
          isMuted: tile.isMuted,
        })),
      };

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

  function applySavedLayout(layoutId: string) {
    const layout = savedLayouts.find((entry) => entry.id === layoutId);
    if (!layout) {
      return;
    }

    setSelectedLayoutId(layout.id);
    setLayoutName(layout.name);
    setLayoutType(layout.layoutType);
    const nextTiles = resizeTiles(
      layout.layoutType,
      layout.items
        .sort((left, right) => left.tileIndex - right.tileIndex)
        .map((item, index) => ({
          channelId: item.channelId,
          preferredQuality: item.preferredQuality ?? (index === 0 ? "AUTO" : "LOWEST"),
          isMuted: item.isMuted,
        })),
    );
    setTiles(nextTiles);
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
          <Select onChange={(event) => setLayoutType(event.target.value as LayoutType)} value={layoutType}>
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
            const qualityOptions = qualityOptionsByTile[index] ?? [{ value: "AUTO", label: "Auto", height: null }];

            return (
              <div
                key={index}
                ref={(element) => {
                  tileRefs.current[index] = element;
                }}
                className={cn(
                  "rounded-[1.9rem] border p-3 shadow-glow",
                  tile.isMuted ? "border-slate-800/80 bg-slate-950/70" : "border-cyan-400/20 bg-cyan-500/5",
                  layoutDefinition.tileClassNames[index],
                )}
              >
                <div className="mb-3 flex flex-wrap gap-3">
                  <div className="min-w-[220px] flex-1">
                    <Select
                      onChange={(event) =>
                        setTiles((current) =>
                          current.map((entry, tileIndex) =>
                            tileIndex === index ? { ...entry, channelId: event.target.value || null } : entry,
                          ),
                        )
                      }
                      value={tile.channelId ?? ""}
                    >
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
                      onChange={(event) =>
                        setTiles((current) =>
                          current.map((entry, tileIndex) =>
                            tileIndex === index ? { ...entry, preferredQuality: event.target.value } : entry,
                          ),
                        )
                      }
                      value={tile.preferredQuality}
                    >
                      {qualityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    onClick={() =>
                      setTiles((current) => enforceSingleActiveAudio(current, index))
                    }
                    variant={tile.isMuted ? "secondary" : "primary"}
                  >
                    {tile.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    {tile.isMuted ? "Muted" : "Live audio"}
                  </Button>
                  <Button
                    onClick={() => tileRefs.current[index]?.requestFullscreen?.()}
                    variant="secondary"
                  >
                    <Maximize2 className="h-4 w-4" />
                    Fullscreen
                  </Button>
                </div>

                <div className="mb-3 flex items-center justify-between gap-4 text-sm">
                  <div>
                    <p className="font-semibold text-white">{channel?.name ?? `Tile ${index + 1}`}</p>
                    <p className="text-slate-400">
                      {channel?.group?.name ?? "No channel selected"}
                    </p>
                  </div>
                  <div className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-xs text-slate-300">
                    {activeAudioIndex === index ? "Audio owner" : "Background tile"}
                  </div>
                </div>

                <div className="h-full">
                  <HlsPlayer
                    autoPlay
                    initialBias={tile.isMuted ? "LOWEST" : "AUTO"}
                    muted={tile.isMuted}
                    onQualityOptionsChange={(options) =>
                      setQualityOptionsByTile((current) => ({
                        ...current,
                        [index]: options,
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
              Only one tile is unmuted at a time, and muted tiles bias toward lower startup quality to conserve resources.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
