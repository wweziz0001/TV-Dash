import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, LayoutTemplate, Maximize2, Minimize2, Search, Tv } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ChannelGuideCard } from "@/components/channels/channel-guide-card";
import { ChannelProgramList } from "@/components/channels/channel-program-list";
import { ChannelPickerDialog } from "@/components/channels/channel-picker-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { usePlaybackSessionHeartbeat } from "@/features/observability/use-playback-session-heartbeat";
import { isEditableKeyboardTarget } from "@/lib/keyboard";
import { HlsPlayer, type PlayerDiagnostics } from "@/player/hls-player";
import { buildPlayerDiagnostics } from "@/player/playback-diagnostics";
import { defaultQualityOptions } from "@/player/quality-options";
import { api, getChannelPlaybackUrl } from "@/services/api";
import type { QualityOption, RecordingJob } from "@/types/api";

export function ChannelWatchPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const [qualities, setQualities] = useState<QualityOption[]>([...defaultQualityOptions]);
  const [selectedQuality, setSelectedQuality] = useState("AUTO");
  const [recordingQuality, setRecordingQuality] = useState("AUTO");
  const [playerDiagnostics, setPlayerDiagnostics] = useState<PlayerDiagnostics>(() =>
    buildPlayerDiagnostics({
      status: "idle",
      muted: false,
    }),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [guidePaddingBeforeMinutes, setGuidePaddingBeforeMinutes] = useState(2);
  const [guidePaddingAfterMinutes, setGuidePaddingAfterMinutes] = useState(5);

  const channelQuery = useQuery({
    queryKey: ["channel", slug, token],
    queryFn: async () => (await api.getChannelBySlug(slug, token)).channel,
    enabled: Boolean(token && slug),
  });

  const favoritesQuery = useQuery({
    queryKey: ["favorites", token],
    queryFn: async () => (await api.listFavorites(token!)).favorites,
    enabled: Boolean(token),
  });

  const channelsQuery = useQuery({
    queryKey: ["channels", token],
    queryFn: async () => (await api.listChannels(token)).channels,
    enabled: Boolean(token),
  });

  const nowNextQuery = useQuery({
    queryKey: ["now-next", channelQuery.data?.id, token],
    queryFn: async () => {
      if (!token || !channelQuery.data) {
        throw new Error("Missing channel context");
      }

      return (await api.getNowNext([channelQuery.data.id], token)).items[0] ?? null;
    },
    enabled: Boolean(token && channelQuery.data?.id),
  });

  const guideWindowQuery = useQuery({
    queryKey: ["guide-window", channelQuery.data?.id, token],
    queryFn: async () => {
      if (!token || !channelQuery.data) {
        throw new Error("Missing channel context");
      }

      const startAt = new Date();
      const endAt = new Date(startAt.getTime() + 24 * 60 * 60_000);

      return (await api.getChannelGuideWindow(channelQuery.data.id, startAt.toISOString(), endAt.toISOString(), token)).guide;
    },
    enabled: Boolean(token && channelQuery.data?.id),
  });

  const recordingJobsQuery = useQuery({
    queryKey: ["recordings-watch", channelQuery.data?.id, token],
    queryFn: async () => {
      if (!token || !channelQuery.data) {
        return [];
      }

      const params = new URLSearchParams({
        channelId: channelQuery.data.id,
        status: "PENDING,SCHEDULED,RECORDING",
      });

      return (await api.listRecordingJobs(token, params)).jobs;
    },
    enabled: Boolean(token && channelQuery.data?.id),
    refetchInterval: 5000,
  });

  const favoriteMutation = useMutation({
    mutationFn: async (isFavorite: boolean) => {
      if (!token || !channelQuery.data) {
        throw new Error("Missing channel context");
      }

      if (isFavorite) {
        await api.removeFavorite(channelQuery.data.id, token);
      } else {
        await api.addFavorite(channelQuery.data.id, token);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update favorites");
    },
  });

  const recordingMutation = useMutation({
    mutationFn: async (job: RecordingJob | null) => {
      if (!token || !channelQuery.data) {
        throw new Error("Missing channel context");
      }

      if (job?.status === "RECORDING") {
        return (await api.stopRecordingJob(job.id, token)).job;
      }

      const effectiveRecordingQuality = recordingQuality === "AUTO" ? selectedQuality : recordingQuality;

      return (
        await api.createRecordingJob(
          {
            channelId: channelQuery.data.id,
            title: null,
            mode: "IMMEDIATE",
            startAt: null,
            endAt: null,
            programEntryId: null,
            paddingBeforeMinutes: 0,
            paddingAfterMinutes: 0,
            requestedQualitySelector: effectiveRecordingQuality,
            requestedQualityLabel:
              qualities.find((option) => option.value === effectiveRecordingQuality)?.label ?? "Source default",
          },
          token,
        )
      ).job;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recordings-watch", channelQuery.data?.id, token] }),
        queryClient.invalidateQueries({ queryKey: ["recordings-active", token] }),
        queryClient.invalidateQueries({ queryKey: ["recordings-library", token] }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update recording");
    },
  });

  const programRecordingMutation = useMutation({
    mutationFn: async (programId: string) => {
      if (!token || !channelQuery.data) {
        throw new Error("Missing channel context");
      }

      return (
        await api.createRecordingJob(
          {
            channelId: channelQuery.data.id,
            title: null,
            mode: "EPG_PROGRAM",
            startAt: null,
            endAt: null,
            programEntryId: programId,
            paddingBeforeMinutes: guidePaddingBeforeMinutes,
            paddingAfterMinutes: guidePaddingAfterMinutes,
            requestedQualitySelector: recordingQuality === "AUTO" ? selectedQuality : recordingQuality,
            requestedQualityLabel:
              qualities.find((option) => option.value === (recordingQuality === "AUTO" ? selectedQuality : recordingQuality))
                ?.label ?? "Source default",
          },
          token,
        )
      ).job;
    },
    onSuccess: async () => {
      toast.success("Guide programme recording created");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recordings-watch", channelQuery.data?.id, token] }),
        queryClient.invalidateQueries({ queryKey: ["recordings-active", token] }),
        queryClient.invalidateQueries({ queryKey: ["recordings-library", token] }),
        queryClient.invalidateQueries({ queryKey: ["recording-rules", token] }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to record this programme");
    },
  });

  const isFavorite = useMemo(() => {
    return (favoritesQuery.data ?? []).some((favorite) => favorite.channelId === channelQuery.data?.id);
  }, [channelQuery.data?.id, favoritesQuery.data]);
  const activeRecording = useMemo(() => {
    return (recordingJobsQuery.data ?? []).find((job) => job.status === "RECORDING") ?? recordingJobsQuery.data?.[0] ?? null;
  }, [recordingJobsQuery.data]);
  const playbackSessionDescriptors = useMemo(() => {
    if (!channelQuery.data) {
      return [];
    }

    return [
      {
        sessionKey: `watch:${channelQuery.data.id}`,
        channelId: channelQuery.data.id,
        sessionType: "SINGLE_VIEW" as const,
        playbackState: playerDiagnostics.status,
        selectedQuality,
        isMuted: playerDiagnostics.isMuted,
        failureKind: playerDiagnostics.failureKind,
      },
    ];
  }, [channelQuery.data, playerDiagnostics.failureKind, playerDiagnostics.isMuted, playerDiagnostics.status, selectedQuality]);

  usePlaybackSessionHeartbeat(token, playbackSessionDescriptors);

  useEffect(() => {
    setQualities([...defaultQualityOptions]);
    setSelectedQuality("AUTO");
    setRecordingQuality("AUTO");
    setPlayerDiagnostics(
      buildPlayerDiagnostics({
        status: "idle",
        muted: false,
      }),
    );
  }, [slug]);

  useEffect(() => {
    if (qualities.some((option) => option.value === recordingQuality)) {
      return;
    }

    setRecordingQuality("AUTO");
  }, [qualities, recordingQuality]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPickerOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsPlayerFullscreen(document.fullscreenElement === playerFrameRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  async function togglePlayerFullscreen() {
    const playerFrame = playerFrameRef.current;

    if (!playerFrame) {
      return;
    }

    if (document.fullscreenElement === playerFrame) {
      await document.exitFullscreen?.();
      return;
    }

    await playerFrame.requestFullscreen?.();
  }

  if (!channelQuery.data) {
    return (
      <Panel>
        <p className="text-sm text-slate-400">Loading channel...</p>
      </Panel>
    );
  }

  const channel = channelQuery.data;
  const playbackUrl = getChannelPlaybackUrl(channel);
  const nowNext = nowNextQuery.data;
  const guideProgrammes = (guideWindowQuery.data?.programmes ?? []).filter((programme) => {
    return !nowNext?.now || programme.id !== nowNext.now.id;
  });

  return (
    <div className="space-y-4">
      <PageHeader
        density="compact"
        eyebrow="Single View"
        title={channel.name}
        description="Real HLS playback with manual quality switching, optional proxy delivery, and live now/next guide context."
        actions={
          <>
            <Button className="w-full sm:w-auto" onClick={() => setPickerOpen(true)} size="sm" variant="secondary">
              <Search className="h-4 w-4" />
              Quick switch
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => favoriteMutation.mutate(isFavorite)}
              size="sm"
              variant={isFavorite ? "primary" : "secondary"}
            >
              <Heart className={isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
              {isFavorite ? "Favorited" : "Add favorite"}
            </Button>
            <Link className="w-full sm:w-auto" to={`/multiview?channels=${channel.id}`}>
              <Button className="w-full" size="sm" variant="secondary">
                <LayoutTemplate className="h-4 w-4" />
                Open in Multi-View
              </Button>
            </Link>
            <Button
              className="w-full sm:w-auto"
              onClick={() => recordingMutation.mutate(activeRecording)}
              size="sm"
              variant={activeRecording?.status === "RECORDING" ? "primary" : "secondary"}
            >
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full ${activeRecording?.status === "RECORDING" ? "bg-rose-300" : "bg-slate-300"}`}
              />
              {activeRecording?.status === "RECORDING" ? "Stop recording" : "Record now"}
            </Button>
            <Link className="w-full sm:w-auto" to={`/recordings?channelId=${channel.id}&mode=SCHEDULED`}>
              <Button className="w-full" size="sm" variant="secondary">
                Schedule
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="p-2 sm:p-2.5" density="compact">
          <div
            className="aspect-video min-h-[220px] max-h-[72vh] sm:min-h-[280px] lg:min-h-[360px] lg:max-h-none lg:aspect-auto lg:h-[calc(100vh-12rem)] xl:h-[calc(100vh-10.5rem)]"
            ref={playerFrameRef}
          >
            <HlsPlayer
              autoPlay
              muted={false}
              onQualityOptionsChange={setQualities}
              onSelectedQualityChange={setSelectedQuality}
              onDiagnosticsChange={setPlayerDiagnostics}
              preferredQuality={selectedQuality}
              src={playbackUrl}
              title={channel.name}
            />
          </div>
        </Panel>

        <div className="grid gap-3 md:grid-cols-2 2xl:sticky 2xl:top-3 2xl:grid-cols-1 2xl:self-start">
          <Panel className="md:col-span-2 2xl:col-span-1" density="compact">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Playback Controls</p>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <label className="mb-1.5 block text-[13px] text-slate-400" htmlFor="quality">
                    Playback quality
                  </label>
                  <Select id="quality" onChange={(event) => setSelectedQuality(event.target.value)} uiSize="sm" value={selectedQuality}>
                    {qualities.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] text-slate-400" htmlFor="recording-quality">
                    Recording quality
                  </label>
                  <Select
                    id="recording-quality"
                    onChange={(event) => setRecordingQuality(event.target.value)}
                    uiSize="sm"
                    value={recordingQuality}
                  >
                    {qualities.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button className="w-full lg:w-auto" onClick={() => void togglePlayerFullscreen()} size="sm" variant="secondary">
                    {isPlayerFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    {isPlayerFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/80 p-3">
                <p className="text-[13px] font-semibold text-white">Current state</p>
                <p className="mt-1.5 text-[13px] text-slate-400">
                  {playerDiagnostics.label} · {selectedQuality === "AUTO" ? "Auto quality" : `Manual quality ${selectedQuality}`}
                </p>
                <p className="mt-1.5 text-[12px] text-slate-300">{playerDiagnostics.summary}</p>
                <p className="mt-2 text-[12px] text-slate-400">
                  Recording:{" "}
                  {activeRecording
                    ? activeRecording.status === "RECORDING"
                      ? "running now"
                      : activeRecording.status.toLowerCase()
                    : "not active"}
                </p>
                <p className="mt-1 text-[12px] text-slate-400">
                  Record now quality:{" "}
                  {qualities.find((option) => option.value === (recordingQuality === "AUTO" ? selectedQuality : recordingQuality))
                    ?.label ?? "Source default"}
                </p>
                {playerDiagnostics.failureKind ? (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    Likely issue: {playerDiagnostics.failureKind}
                  </p>
                ) : null}
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {channel.playbackMode === "PROXY"
                    ? "Playback is routed through the TV-Dash stream gateway."
                    : "Playback uses the channel's direct upstream HLS URL."}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Audio: {playerDiagnostics.isMuted ? "Muted by player" : "Live audio enabled"}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {isPlayerFullscreen
                    ? "Fullscreen keeps the operator overlays visible and returns to the same state when you exit."
                    : "Use fullscreen for cleaner mobile viewing or large-screen monitoring without losing playback state."}
                </p>
              </div>
            </div>
          </Panel>

          <Panel density="compact">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Now / Next</p>
            <ChannelGuideCard
              className="mt-3"
              guide={nowNext}
              hasEpgSource={Boolean(channel.epgSource || channel.hasManualPrograms)}
              isLoading={nowNextQuery.isLoading}
              variant="detailed"
            />
            {nowNext?.now || nowNext?.next ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {nowNext.now ? (
                  <>
                    <Button onClick={() => programRecordingMutation.mutate(nowNext.now!.id)} size="sm" variant="secondary">
                      Record current program
                    </Button>
                    <Link
                      to={`/recordings?workflow=rule&channelId=${encodeURIComponent(channel.id)}&programId=${encodeURIComponent(nowNext.now.id)}&programTitle=${encodeURIComponent(nowNext.now.title)}&startAt=${encodeURIComponent(nowNext.now.start)}&endAt=${encodeURIComponent(nowNext.now.stop ?? nowNext.now.start)}`}
                    >
                      <Button size="sm" variant="ghost">
                        Repeat current program
                      </Button>
                    </Link>
                  </>
                ) : null}
                {nowNext.next ? (
                  <>
                    <Button onClick={() => programRecordingMutation.mutate(nowNext.next!.id)} size="sm" variant="secondary">
                      Record next program
                    </Button>
                    <Link
                      to={`/recordings?workflow=rule&channelId=${encodeURIComponent(channel.id)}&programId=${encodeURIComponent(nowNext.next.id)}&programTitle=${encodeURIComponent(nowNext.next.title)}&startAt=${encodeURIComponent(nowNext.next.start)}&endAt=${encodeURIComponent(nowNext.next.stop ?? nowNext.next.start)}`}
                    >
                      <Button size="sm" variant="ghost">
                        Repeat next program
                      </Button>
                    </Link>
                  </>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-[12px] text-slate-400" htmlFor="guide-padding-before">
                  Start early
                </label>
                <Select
                  id="guide-padding-before"
                  onChange={(event) => setGuidePaddingBeforeMinutes(Number(event.target.value))}
                  uiSize="sm"
                  value={guidePaddingBeforeMinutes}
                >
                  {[0, 1, 2, 5, 10, 15].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes === 0 ? "No padding" : `${minutes} min`}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] text-slate-400" htmlFor="guide-padding-after">
                  End late
                </label>
                <Select
                  id="guide-padding-after"
                  onChange={(event) => setGuidePaddingAfterMinutes(Number(event.target.value))}
                  uiSize="sm"
                  value={guidePaddingAfterMinutes}
                >
                  {[0, 1, 2, 5, 10, 15].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes === 0 ? "No padding" : `${minutes} min`}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-3 py-2.5 text-[12px] text-slate-400">
                Guide recordings use the real programme window and apply these padding values before the job is scheduled.
              </div>
            </div>
          </Panel>

          <Panel density="compact">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Upcoming guide programmes</p>
            <div className="mt-3">
              <ChannelProgramList
                buildRuleHref={(programme) =>
                  `/recordings?workflow=rule&channelId=${encodeURIComponent(channel.id)}&programId=${encodeURIComponent(programme.id)}&programTitle=${encodeURIComponent(programme.title)}&startAt=${encodeURIComponent(programme.start)}&endAt=${encodeURIComponent(programme.stop ?? programme.start)}`
                }
                isLoading={guideWindowQuery.isLoading}
                onRecordProgram={(programme) => programRecordingMutation.mutate(programme.id)}
                programmes={guideProgrammes}
              />
            </div>
          </Panel>

          <Panel density="compact">
            <div className="flex items-center gap-3">
              <Tv className="h-4 w-4 text-accent" />
              <div>
                <p className="text-sm font-semibold text-white">{channel.group?.name ?? "Ungrouped"}</p>
                <p className="text-[13px] text-slate-400">Slug: {channel.slug}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2.5 text-[13px] text-slate-400">
              <p>Stream access</p>
              <p className="rounded-xl bg-slate-950/80 p-2.5 font-mono text-[11px] text-slate-300">
                {channel.playbackMode === "PROXY" ? playbackUrl : channel.masterHlsUrl}
              </p>
              <p>
                Guide link:{" "}
                {channel.epgSource
                  ? `${channel.epgSource.name} / ${channel.epgChannelId}`
                  : channel.hasManualPrograms
                    ? "manual programme entries"
                    : "not configured"}
              </p>
            </div>
          </Panel>
        </div>
      </div>

      <ChannelPickerDialog
        allowClear={false}
        channels={channelsQuery.data ?? []}
        description="Search the full channel list and jump straight into another live feed without leaving the player."
        nowNextByChannelId={undefined}
        onClose={() => setPickerOpen(false)}
        onSelect={(channelId) => {
          const nextChannel = (channelsQuery.data ?? []).find((entry) => entry.id === channelId);

          if (!nextChannel) {
            return;
          }

          setPickerOpen(false);
          navigate(`/watch/${nextChannel.slug}`);
        }}
        open={pickerOpen}
        selectedChannelId={channel.id}
        title="Quick channel switch"
      />
    </div>
  );
}
