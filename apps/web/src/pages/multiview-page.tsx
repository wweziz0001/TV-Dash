import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Keyboard, LayoutTemplate, Save, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import type { LayoutType } from "@tv-dash/shared";
import { ChannelGuideCard } from "@/components/channels/channel-guide-card";
import { ChannelPickerDialog } from "@/components/channels/channel-picker-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { buildPlaybackSessionSemantics } from "@/features/observability/playback-session-semantics";
import { usePlaybackSessionHeartbeat } from "@/features/observability/use-playback-session-heartbeat";
import { isEditableKeyboardTarget } from "@/lib/keyboard";
import { useDeviceProfile } from "@/lib/use-device-profile";
import { cn } from "@/lib/utils";
import type { PlayerDiagnostics, PlayerStatus } from "@/player/hls-player";
import { getLayoutDefinition, layoutDefinitions } from "@/player/layouts";
import { enforceSingleActiveAudio, resizeTiles, type TileState } from "@/player/multiview-layout";
import { buildPlayerDiagnostics } from "@/player/playback-diagnostics";
import { getLayoutTypeForShortcut, getWrappedTileIndex } from "@/player/multiview-shortcuts";
import {
  hydrateMultiviewLayout,
  pruneTileScopedState,
  replaceTileChannel,
  resetTileQualityOptions,
  serializeMultiviewLayout,
  setTilePreferredQuality,
  setTileQualityOptions,
  swapTileScopedState,
  swapTiles,
} from "@/player/multiview-state";
import { MultiviewTileCard } from "@/player/multiview-tile-card";
import {
  constrainMultiviewLayoutType,
  getMultiviewViewportPolicy,
  getSuggestedMultiviewLayoutType,
} from "@/player/multiview-viewport";
import { defaultQualityOptions } from "@/player/quality-options";
import { api, getChannelPlaybackTargets, resolveApiUrl } from "@/services/api";
import type { LiveTimeshiftStatus, QualityOption, RecordingJob } from "@/types/api";

export function MultiViewPage() {
  const { token } = useAuth();
  const { deviceClass, isCoarsePointer, viewportWidth } = useDeviceProfile();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialChannelsApplied = useRef(false);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [layoutType, setLayoutType] = useState<LayoutType>("LAYOUT_2X2");
  const [layoutName, setLayoutName] = useState("Ops Layout");
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [focusedTileIndex, setFocusedTileIndex] = useState(0);
  const [pickerTileIndex, setPickerTileIndex] = useState<number | null>(null);
  const [draggedTileIndex, setDraggedTileIndex] = useState<number | null>(null);
  const [dragTargetTileIndex, setDragTargetTileIndex] = useState<number | null>(null);
  const [tiles, setTiles] = useState<TileState[]>(resizeTiles("LAYOUT_2X2", [], { ensureAudioOwner: true }));
  const [qualityOptionsByTile, setQualityOptionsByTile] = useState<Record<number, QualityOption[]>>({});
  const [playerStatusByTile, setPlayerStatusByTile] = useState<Record<number, PlayerStatus>>({});
  const [playerDiagnosticsByTile, setPlayerDiagnosticsByTile] = useState<Record<number, PlayerDiagnostics>>({});
  const viewportPolicy = useMemo(() => getMultiviewViewportPolicy(viewportWidth), [viewportWidth]);
  const canDragSwap = !isCoarsePointer && deviceClass !== "mobile";

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

  const tileChannelIds = useMemo(
    () => [...new Set(tiles.map((tile) => tile.channelId).filter((channelId): channelId is string => Boolean(channelId)))],
    [tiles],
  );
  const activeChannelCount = tileChannelIds.length;
  const availableLayouts = useMemo(
    () => layoutDefinitions.filter((layout) => viewportPolicy.allowedLayoutTypes.includes(layout.type)),
    [viewportPolicy.allowedLayoutTypes],
  );

  const nowNextQuery = useQuery({
    queryKey: ["multiview-now-next", token, tileChannelIds],
    queryFn: async () => {
      if (!token || !tileChannelIds.length) {
        return [];
      }

      return (await api.getNowNext(tileChannelIds, token)).items;
    },
    enabled: Boolean(token && tileChannelIds.length),
  });

  const streamSessionQuery = useQuery({
    queryKey: ["multiview-stream-session", token, tileChannelIds],
    queryFn: async () => {
      if (!token || !tileChannelIds.length) {
        return {};
      }

      const statuses = await Promise.all(
        tileChannelIds.map(async (channelId) => [
          channelId,
          (await api.getChannelStreamSessionStatus(channelId, token)).status,
        ] as const),
      );

      return Object.fromEntries(statuses);
    },
    enabled: Boolean(token && tileChannelIds.length),
    refetchInterval: 10000,
  });

  const recordingJobsQuery = useQuery({
    queryKey: ["recordings-multiview", token],
    queryFn: async () => {
      if (!token) {
        return [];
      }

      const params = new URLSearchParams({
        status: "PENDING,SCHEDULED,RECORDING",
      });

      return (await api.listRecordingJobs(token, params)).jobs;
    },
    enabled: Boolean(token),
    refetchInterval: 5000,
  });

  useEffect(() => {
    setTiles((current) => resizeTiles(layoutType, current, { ensureAudioOwner: true }));
    setQualityOptionsByTile((current) => pruneTileScopedState(current, getLayoutDefinition(layoutType).tileCount));
    setPlayerStatusByTile((current) => pruneTileScopedState(current, getLayoutDefinition(layoutType).tileCount));
    setPlayerDiagnosticsByTile((current) => pruneTileScopedState(current, getLayoutDefinition(layoutType).tileCount));
    setFocusedTileIndex((current) => Math.min(current, getLayoutDefinition(layoutType).tileCount - 1));
    setPickerTileIndex((current) =>
      typeof current === "number" ? Math.min(current, getLayoutDefinition(layoutType).tileCount - 1) : null,
    );
  }, [layoutType]);

  useEffect(() => {
    const constrainedLayoutType = constrainMultiviewLayoutType(layoutType, viewportWidth, activeChannelCount);

    if (constrainedLayoutType !== layoutType) {
      setLayoutType(constrainedLayoutType);
    }
  }, [activeChannelCount, layoutType, viewportWidth]);

  useEffect(() => {
    if (!channelsQuery.data || initialChannelsApplied.current) {
      return;
    }

    const seededIds = (searchParams.get("channels")?.split(",").filter(Boolean) ?? []).slice(0, viewportPolicy.maxTileCount);
    const fallbackIds = channelsQuery.data.slice(0, viewportPolicy.maxTileCount).map((channel) => channel.id);
    const nextIds = seededIds.length ? seededIds : fallbackIds;
    const nextLayoutType = getSuggestedMultiviewLayoutType(viewportWidth, nextIds.length);

    setLayoutType(nextLayoutType);
    setTiles(
      resizeTiles(nextLayoutType, [], { ensureAudioOwner: true }).map((tile, index) => ({
        ...tile,
        channelId: nextIds[index] ?? null,
      })),
    );
    setFocusedTileIndex(0);
    initialChannelsApplied.current = true;
  }, [channelsQuery.data, searchParams, viewportPolicy.maxTileCount, viewportWidth]);

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
    onSuccess: async (response, mode) => {
      setSelectedLayoutId(response.layout.id);
      toast.success(mode === "update" ? "Saved layout updated" : "Saved as a new operator layout");
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
      toast.success("Saved layout removed");
      setSelectedLayoutId(null);
      setLayoutName("Ops Layout");
      await queryClient.invalidateQueries({ queryKey: ["layouts", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete layout");
    },
  });

  const recordingMutation = useMutation({
    mutationFn: async (params: { channelId: string; job: RecordingJob | null; requestedQualitySelector: string; requestedQualityLabel: string | null }) => {
      if (!token) {
        throw new Error("Missing session");
      }

      if (params.job?.status === "RECORDING") {
        return (await api.stopRecordingJob(params.job.id, token)).job;
      }

      return (
        await api.createRecordingJob(
          {
            channelId: params.channelId,
            title: null,
            mode: "IMMEDIATE",
            startAt: null,
            endAt: null,
            programEntryId: null,
            paddingBeforeMinutes: 0,
            paddingAfterMinutes: 0,
            requestedQualitySelector: params.requestedQualitySelector,
            requestedQualityLabel: params.requestedQualityLabel,
          },
          token,
        )
      ).job;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recordings-multiview", token] }),
        queryClient.invalidateQueries({ queryKey: ["recordings-active", token] }),
        queryClient.invalidateQueries({ queryKey: ["recordings-library", token] }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update recording");
    },
  });

  const layoutDefinition = getLayoutDefinition(layoutType);
  const savedLayouts = layoutsQuery.data ?? [];
  const channels = channelsQuery.data ?? [];
  const selectedLayout = savedLayouts.find((layout) => layout.id === selectedLayoutId) ?? null;

  const channelMap = useMemo(() => new Map(channels.map((channel) => [channel.id, channel])), [channels]);
  const activeRecordingByChannelId = useMemo(() => {
    const nextMap = new Map<string, RecordingJob>();

    for (const job of recordingJobsQuery.data ?? []) {
      if (!job.channelId || nextMap.has(job.channelId)) {
        continue;
      }

      nextMap.set(job.channelId, job);
    }

    return nextMap;
  }, [recordingJobsQuery.data]);
  const nowNextByChannelId = useMemo(
    () => new Map((nowNextQuery.data ?? []).map((item) => [item.channelId, item])),
    [nowNextQuery.data],
  );
  const playbackSessionDescriptors = useMemo(
    () =>
      tiles.flatMap((tile, index) => {
        if (!tile.channelId) {
          return [];
        }

        const diagnostics =
          playerDiagnosticsByTile[index] ??
          buildPlayerDiagnostics({
            status: "loading",
            muted: tile.isMuted,
          });
        const sessionSemantics = buildPlaybackSessionSemantics(diagnostics);

        return [
          {
            sessionKey: `multiview:${index}`,
            channelId: tile.channelId,
            sessionType: "MULTIVIEW" as const,
            playbackState: sessionSemantics.playbackState,
            playbackPositionState: sessionSemantics.playbackPositionState,
            liveOffsetSeconds: sessionSemantics.liveOffsetSeconds,
            selectedQuality: tile.preferredQuality ?? "AUTO",
            isMuted: tile.isMuted,
            tileIndex: index,
            failureKind: diagnostics.failureKind,
          },
        ];
      }),
    [playerDiagnosticsByTile, tiles],
  );

  usePlaybackSessionHeartbeat(token, playbackSessionDescriptors);

  const focusedTile = tiles[focusedTileIndex] ?? tiles[0];
  const focusedChannel = focusedTile?.channelId ? channelMap.get(focusedTile.channelId) ?? null : null;
  const focusedGuide = focusedChannel ? nowNextByChannelId.get(focusedChannel.id) : null;
  const streamSessionByChannelId = streamSessionQuery.data ?? {};
  const timeshiftStatusByChannelId = Object.fromEntries(
    Object.entries(streamSessionByChannelId).map(([channelId, status]) => [channelId, status.timeshift]),
  ) as Record<string, LiveTimeshiftStatus>;
  const focusedStreamSession = focusedChannel ? streamSessionByChannelId[focusedChannel.id] ?? null : null;
  const focusedTimeshiftStatus = focusedChannel ? timeshiftStatusByChannelId[focusedChannel.id] ?? null : null;
  const focusedPlayerDiagnostics =
    playerDiagnosticsByTile[focusedTileIndex] ??
    buildPlayerDiagnostics({
      status: focusedChannel ? "loading" : "idle",
      muted: focusedTile?.isMuted ?? true,
    });

  function updateLayoutType(nextLayoutType: LayoutType) {
    setLayoutType(constrainMultiviewLayoutType(nextLayoutType, viewportWidth, activeChannelCount));
  }

  function applySavedLayout(layoutId: string) {
    const layout = savedLayouts.find((entry) => entry.id === layoutId);
    if (!layout) {
      return;
    }

    const nextState = hydrateMultiviewLayout(layout);
    const populatedTileCount = layout.items.filter((item) => item.channelId).length;
    const nextLayoutType = constrainMultiviewLayoutType(layout.layoutType, viewportWidth, populatedTileCount);
    setSelectedLayoutId(layout.id);
    setLayoutName(layout.name);
    setLayoutType(nextLayoutType);
    setTiles(resizeTiles(nextLayoutType, nextState.tiles, { ensureAudioOwner: true }));
    setFocusedTileIndex(Math.min(nextState.focusedTileIndex, getLayoutDefinition(nextLayoutType).tileCount - 1));
    setPickerTileIndex(null);
    setQualityOptionsByTile({});
    setPlayerStatusByTile({});
    setPlayerDiagnosticsByTile({});
  }

  function handleChannelChange(tileIndex: number, channelId: string | null) {
    setTiles((current) => replaceTileChannel(current, tileIndex, channelId));
    setQualityOptionsByTile((current) => resetTileQualityOptions(current, tileIndex));
    setPlayerStatusByTile((current) => ({
      ...current,
      [tileIndex]: channelId ? "loading" : "idle",
    }));
    setPlayerDiagnosticsByTile((current) => ({
      ...current,
      [tileIndex]: buildPlayerDiagnostics({
        status: channelId ? "loading" : "idle",
        muted: tiles[tileIndex]?.isMuted ?? true,
      }),
    }));
  }

  function handleAudioToggle(tileIndex: number) {
    setTiles((current) => enforceSingleActiveAudio(current, tileIndex));
    setFocusedTileIndex(tileIndex);
  }

  function handleTileSwap(sourceIndex: number, targetIndex: number) {
    if (sourceIndex === targetIndex) {
      return;
    }

    setTiles((current) => swapTiles(current, sourceIndex, targetIndex));
    setQualityOptionsByTile((current) => swapTileScopedState(current, sourceIndex, targetIndex));
    setPlayerStatusByTile((current) => swapTileScopedState(current, sourceIndex, targetIndex));
    setPlayerDiagnosticsByTile((current) => swapTileScopedState(current, sourceIndex, targetIndex));
    setFocusedTileIndex((current) =>
      current === sourceIndex ? targetIndex : current === targetIndex ? sourceIndex : current,
    );
    setPickerTileIndex((current) =>
      current === sourceIndex ? targetIndex : current === targetIndex ? sourceIndex : current,
    );
  }

  function openTilePicker(tileIndex: number) {
    setFocusedTileIndex(tileIndex);
    setPickerTileIndex(tileIndex);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openTilePicker(focusedTileIndex);
        return;
      }

      if (event.shiftKey) {
        const nextLayoutType = getLayoutTypeForShortcut(event.key);

        if (nextLayoutType) {
          event.preventDefault();
          updateLayoutType(nextLayoutType);
        }

        return;
      }

      if (event.key === "[") {
        event.preventDefault();
        setFocusedTileIndex((current) => getWrappedTileIndex(current, -1, tiles.length));
        return;
      }

      if (event.key === "]") {
        event.preventDefault();
        setFocusedTileIndex((current) => getWrappedTileIndex(current, 1, tiles.length));
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        handleAudioToggle(focusedTileIndex);
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        openTilePicker(focusedTileIndex);
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        tileRefs.current[focusedTileIndex]?.requestFullscreen?.();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handleChannelChange(focusedTileIndex, null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [focusedTileIndex, tiles.length]);

  return (
    <div className="space-y-4">
      <PageHeader
        density="compact"
        eyebrow="Multi-View"
        title="Operator wall"
        description="Swap tiles quickly, keep one live audio owner, and keep the wall itself as the primary surface."
        actions={
          <>
            <Button className="w-full sm:w-auto" onClick={() => saveMutation.mutate("create")} size="sm">
              <Save className="h-4 w-4" />
              Save as new
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={!selectedLayoutId}
              onClick={() => saveMutation.mutate("update")}
              size="sm"
              variant="secondary"
            >
              <Save className="h-4 w-4" />
              Update selected
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={!selectedLayoutId}
              onClick={() => deleteMutation.mutate()}
              size="sm"
              variant="secondary"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[0.46fr_0.24fr_0.3fr]">
          <Input onChange={(event) => setLayoutName(event.target.value)} placeholder="Layout name" uiSize="sm" value={layoutName} />
          <Select
            onChange={(event) => {
              if (event.target.value) {
                applySavedLayout(event.target.value);
              }
            }}
            uiSize="sm"
            value={selectedLayoutId ?? ""}
          >
            <option value="">Load saved layout</option>
            {savedLayouts.map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.name}
              </option>
            ))}
          </Select>
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 px-3 py-2.5 md:col-span-2 2xl:col-span-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Current wall </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {selectedLayout ? `Editing saved layout: ${selectedLayout.name}` : "Working in an unsaved operator draft"} ·{" "}
              {deviceClass}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {availableLayouts.map((layout) => (
            <Button
              key={layout.type}
              onClick={() => updateLayoutType(layout.type)}
              size="sm"
              variant={layout.type === layoutType ? "primary" : "secondary"}
            >
              <LayoutTemplate className="h-4 w-4" />
              {layout.label}
            </Button>
          ))}
        </div>

      </PageHeader>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="p-2 sm:p-2.5" density="compact">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Live wall</p>
              <p className="mt-0.5 text-[13px] text-slate-400">
                {activeChannelCount} active feed(s) · focus tile {focusedTileIndex + 1}
              </p>
            </div>
          </div>

          <div className={cn("grid gap-3", layoutDefinition.containerClassName)}>
            {tiles.map((tile, index) => {
              const channel = tile.channelId ? channelMap.get(tile.channelId) ?? null : null;
              const recordingJob = channel ? activeRecordingByChannelId.get(channel.id) ?? null : null;
              const streamSession = channel ? streamSessionByChannelId[channel.id] ?? null : null;
              const timeshiftStatus = channel ? timeshiftStatusByChannelId[channel.id] ?? null : null;
              const qualityOptions = qualityOptionsByTile[index] ?? [...defaultQualityOptions];
              const playerStatus = playerStatusByTile[index] ?? (channel ? "loading" : "idle");
              const playerDiagnostics =
                playerDiagnosticsByTile[index] ??
                buildPlayerDiagnostics({
                  status: channel ? "loading" : "idle",
                  muted: tile.isMuted,
                });

              return (
                <div
                  key={index}
                  className="min-h-0"
                  ref={(element) => {
                    tileRefs.current[index] = element;
                  }}
                >
                  <MultiviewTileCard
                    channel={channel}
                    guide={channel ? nowNextByChannelId.get(channel.id) : null}
                    guideLoading={nowNextQuery.isLoading}
                    isDragging={draggedTileIndex === index}
                    isDragTarget={dragTargetTileIndex === index && draggedTileIndex !== index}
                    canDragSwap={canDragSwap}
                    isFocused={focusedTileIndex === index}
                    isPickerTarget={pickerTileIndex === index}
                    layoutDefinition={layoutDefinition}
                    onClear={() => handleChannelChange(index, null)}
                    onDragEnd={() => {
                      setDraggedTileIndex(null);
                      setDragTargetTileIndex(null);
                    }}
                    onDragOver={(event) => {
                      if (!canDragSwap) {
                        return;
                      }

                      event.preventDefault();
                      if (draggedTileIndex !== null) {
                        setDragTargetTileIndex(index);
                      }
                    }}
                    onDragStart={(event) => {
                      if (!canDragSwap) {
                        event.preventDefault();
                        return;
                      }

                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(index));
                      setDraggedTileIndex(index);
                      setDragTargetTileIndex(index);
                      setFocusedTileIndex(index);
                    }}
                    onDrop={(event) => {
                      if (!canDragSwap) {
                        return;
                      }

                      event.preventDefault();
                      const sourceIndex =
                        draggedTileIndex ?? Number.parseInt(event.dataTransfer.getData("text/plain"), 10);

                      if (Number.isInteger(sourceIndex)) {
                        handleTileSwap(sourceIndex, index);
                      }

                      setDraggedTileIndex(null);
                      setDragTargetTileIndex(null);
                    }}
                    onFocus={() => setFocusedTileIndex(index)}
                    onFullscreen={() => tileRefs.current[index]?.requestFullscreen?.()}
                    onOpenPicker={() => openTilePicker(index)}
                    onPreferredQualityChange={(value) =>
                      setTiles((current) => setTilePreferredQuality(current, index, value))
                    }
                    onToggleRecording={() => {
                      if (!channel) {
                        return;
                      }

                      const resolvedRecordingQuality = resolveRecordingQualityPreference(
                        tile.preferredQuality ?? "AUTO",
                        qualityOptions,
                      );

                      recordingMutation.mutate({
                        channelId: channel.id,
                        job: recordingJob,
                        requestedQualitySelector: resolvedRecordingQuality.value,
                        requestedQualityLabel: resolvedRecordingQuality.label,
                      });
                    }}
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
                    onDiagnosticsChange={(diagnostics) =>
                      setPlayerDiagnosticsByTile((current) => ({
                        ...current,
                        [index]: diagnostics,
                      }))
                    }
                    playerDiagnostics={playerDiagnostics}
                    onToggleAudio={() => handleAudioToggle(index)}
                    playerStatus={playerStatus}
                    qualityOptions={qualityOptions}
                    recordingJob={recordingJob}
                    src={
                      (() => {
                        if (!channel) {
                          return null;
                        }

                        const playbackUrl = getChannelPlaybackTargets(channel, {
                          preferProxy: true,
                          sessionStatus: streamSession,
                          timeshiftStatus,
                        }).defaultPlaybackUrl;

                        return playbackUrl ? resolveApiUrl(playbackUrl) : null;
                      })()
                    }
                    timeshiftStatus={timeshiftStatus}
                    tile={tile}
                    tileIndex={index}
                  />
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="grid gap-3 lg:grid-cols-2 2xl:sticky 2xl:top-3 2xl:grid-cols-1 2xl:self-start">
          <Panel className="lg:col-span-2 2xl:col-span-1" density="compact">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Focused Tile</p>
                <h2 className="mt-1 text-base font-semibold text-white">
                  {focusedChannel?.name ?? `Tile ${focusedTileIndex + 1}`}
                </h2>
                <p className="mt-1 text-[13px] text-slate-400">
                  Tile {focusedTileIndex + 1} of {tiles.length} · {focusedChannel?.group?.name ?? "Awaiting channel assignment"}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Button onClick={() => openTilePicker(focusedTileIndex)} size="sm" variant="secondary">
                  Assign
                </Button>
                <Button
                  onClick={() => handleAudioToggle(focusedTileIndex)}
                  size="sm"
                  variant={focusedTile?.isMuted ? "secondary" : "primary"}
                >
                  {focusedTile?.isMuted ? "Muted" : "Audio live"}
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              <ChannelGuideCard
                guide={focusedGuide}
                hasEpgSource={Boolean(focusedChannel?.epgSource || focusedChannel?.hasManualPrograms)}
                isLoading={nowNextQuery.isLoading}
                variant="detailed"
              />

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Focused Tile Status</p>
                <p className="mt-2 text-[12px] text-slate-300">{focusedPlayerDiagnostics.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-200">
                    {focusedPlayerDiagnostics.label}
                  </span>
                  <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-200">
                    {focusedTile?.preferredQuality ?? "AUTO"}
                  </span>
                  <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-200">
                    {focusedTile?.isMuted ? "Muted tile" : "Audio owner"}
                  </span>
                  <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-200">
                    {focusedTimeshiftStatus?.supported
                      ? focusedTimeshiftStatus.available
                        ? `DVR ${Math.floor(focusedTimeshiftStatus.availableWindowSeconds / 60)}m`
                        : "DVR warming"
                      : "Live only"}
                  </span>
                  {focusedPlayerDiagnostics.failureKind ? (
                    <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">
                      {focusedPlayerDiagnostics.failureKind}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-[12px] text-slate-400">
                  {focusedStreamSession?.sessionMode === "SHARED_DVR"
                    ? "Focused feed is using one shared local channel session for live relay plus a retained DVR window."
                    : focusedStreamSession?.sessionMode === "SHARED_RELAY"
                      ? "Focused feed is using shared live relay/cache only."
                      : focusedStreamSession?.sessionMode === "PROXY_DVR"
                        ? "Focused feed is using proxy-managed live delivery with a retained DVR window."
                        : focusedStreamSession?.sessionMode === "PROXY_RELAY"
                          ? "Focused feed is using proxy-managed live relay only."
                          : canDragSwap
                            ? "Drag tiles to swap positions, replace the focused source quickly, and keep most of the screen on the live wall."
                            : "Touch mode keeps swapping off so the wall stays stable while you replace feeds and move through focused monitoring."}
                </p>
                <p className="mt-1 text-[12px] text-slate-500">
                  {canDragSwap
                    ? "Live-edge viewers can stay current while buffered viewers move behind live inside the same retained channel window when DVR is ready."
                    : "Touch mode keeps the wall stable while the player still distinguishes live edge from behind-live playback."}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3">
                <div className="flex items-center gap-2.5">
                  <Keyboard className="h-4 w-4 text-accent" />
                  <div>
                    <p className="text-sm font-semibold text-white">Operator shortcuts</p>
                    <p className="text-[12px] text-slate-400">Keyboard and remote-friendly controls.</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 text-[12px] text-slate-300">
                  <p>
                    <span className="font-mono text-cyan-200">[</span> / <span className="font-mono text-cyan-200">]</span> focus previous or next tile
                  </p>
                  <p>
                    <span className="font-mono text-cyan-200">M</span> toggle audio ownership for the focused tile
                  </p>
                  <p>
                    <span className="font-mono text-cyan-200">C</span> or <span className="font-mono text-cyan-200">Ctrl/Cmd + K</span> open the focused tile picker
                  </p>
                  <p>
                    <span className="font-mono text-cyan-200">F</span> fullscreen the focused tile
                  </p>
                  <p>
                    <span className="font-mono text-cyan-200">Delete</span> clear the focused tile
                  </p>
                  <p>
                    <span className="font-mono text-cyan-200">Shift + 1-5</span> switch the allowed layout presets
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          <Panel density="compact">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Saved Layouts</p>
            {savedLayouts.length ? (
              <div className="mt-3 space-y-2.5">
                {savedLayouts.map((layout) => {
                  const filledTileCount = layout.items.filter((item) => item.channelId).length;
                  const previewNames = layout.items
                    .filter((item) => item.channel)
                    .slice(0, 3)
                    .map((item) => item.channel?.name ?? "Unassigned")
                    .join(" · ");

                  return (
                    <div
                      key={layout.id}
                      className={cn(
                        "rounded-xl border border-slate-800/80 bg-slate-950/70 p-3",
                        layout.id === selectedLayoutId && "border-cyan-300/60 bg-cyan-500/5",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2.5">
                        <div>
                          <p className="text-sm font-semibold text-white">{layout.name}</p>
                          <p className="mt-0.5 text-[12px] text-slate-400">
                            {layout.layoutType} · {filledTileCount} populated tile(s)
                          </p>
                        </div>
                        <Button onClick={() => applySavedLayout(layout.id)} size="sm" variant="secondary">
                          Apply
                        </Button>
                      </div>
                      <p className="mt-2 text-[12px] text-slate-300">
                        {previewNames || "Saved empty tile placeholders for a draft wall."}
                      </p>
                      <p className="mt-1.5 text-[10px] text-slate-500">Updated {formatTimestamp(layout.updatedAt)}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-700/80 bg-slate-950/60 p-4">
                <p className="text-base font-semibold text-white">No saved layouts yet.</p>
                <p className="mt-1.5 text-[13px] text-slate-400">
                  Build a wall, name it, and save it as a reusable operator preset for recurring monitoring setups.
                </p>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <ChannelPickerDialog
        allowClear={pickerTileIndex !== null}
        channels={channels}
        description="Search once and replace the focused tile without scanning long dropdowns."
        nowNextByChannelId={nowNextByChannelId}
        onClear={() => {
          if (typeof pickerTileIndex === "number") {
            handleChannelChange(pickerTileIndex, null);
          }
          setPickerTileIndex(null);
        }}
        onClose={() => setPickerTileIndex(null)}
        onSelect={(channelId) => {
          if (typeof pickerTileIndex === "number") {
            handleChannelChange(pickerTileIndex, channelId);
            setFocusedTileIndex(pickerTileIndex);
          }
          setPickerTileIndex(null);
        }}
        open={typeof pickerTileIndex === "number"}
        selectedChannelId={typeof pickerTileIndex === "number" ? tiles[pickerTileIndex]?.channelId ?? null : null}
        title={`Assign channel to tile ${typeof pickerTileIndex === "number" ? pickerTileIndex + 1 : ""}`}
      />
    </div>
  );
}

function resolveRecordingQualityPreference(preferredQuality: string, qualityOptions: QualityOption[]) {
  if (preferredQuality === "LOWEST") {
    const lowest = [...qualityOptions].filter((option) => option.value !== "AUTO").at(-1);
    return {
      value: lowest?.value ?? "AUTO",
      label: lowest?.label ?? "Source default",
    };
  }

  if (preferredQuality === "HIGHEST") {
    const highest = qualityOptions.find((option) => option.value !== "AUTO");
    return {
      value: highest?.value ?? "AUTO",
      label: highest?.label ?? "Source default",
    };
  }

  const exact = qualityOptions.find((option) => option.value === preferredQuality);
  return {
    value: exact?.value ?? preferredQuality ?? "AUTO",
    label: exact?.label ?? "Source default",
  };
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
