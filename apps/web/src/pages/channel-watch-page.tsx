import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, LayoutTemplate, LoaderCircle, Maximize2, Minimize2, PlayCircle, Search, Tv } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ChannelArchivePanel } from "@/components/channels/channel-archive-panel";
import { ChannelGuideCard } from "@/components/channels/channel-guide-card";
import { formatProgrammeTimeWithDay } from "@/components/channels/channel-guide-state";
import { ChannelProgramList } from "@/components/channels/channel-program-list";
import { getProgramCatchupBadges, getProgramCatchupCopy } from "@/components/channels/channel-program-catchup-state";
import { ChannelPickerDialog } from "@/components/channels/channel-picker-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { buildPlaybackSessionSemantics } from "@/features/observability/playback-session-semantics";
import { usePlaybackSessionHeartbeat } from "@/features/observability/use-playback-session-heartbeat";
import { isEditableKeyboardTarget } from "@/lib/keyboard";
import { getPlaybackModeLabel } from "@/lib/playback-mode";
import { ArchivePlayer } from "@/player/archive-player";
import { HlsPlayer, type PlayerDiagnostics } from "@/player/hls-player";
import { buildPlayerDiagnostics } from "@/player/playback-diagnostics";
import { defaultQualityOptions } from "@/player/quality-options";
import { buildPlayerTimeshiftUiModel } from "@/player/timeshift-ui";
import { api, getChannelPlaybackTargets, resolveApiUrl } from "@/services/api";
import type { ChannelProgramPlayback, LiveTimeshiftStatus, NowNextProgram, QualityOption, RecordingJob } from "@/types/api";

function getCatchupBadgeClassName(tone: "live" | "positive" | "warning" | "neutral") {
  switch (tone) {
    case "live":
      return "border-rose-400/30 bg-rose-500/10 text-rose-100";
    case "positive":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
    case "warning":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    default:
      return "border-slate-700/80 bg-slate-900/80 text-slate-300";
  }
}

function formatAvailabilityTime(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getCatchupPlaybackKindLabel(playback: ChannelProgramPlayback) {
  switch (playback.playbackKind) {
    case "WATCH_FROM_START":
      return "Watching the current programme from its start";
    case "CATCHUP_RECORDING":
      return "Catch-up playback from a recording";
    case "CATCHUP_TIMESHIFT":
      return "Catch-up playback from the retained DVR window";
    default:
      return "Catch-up playback";
  }
}

function getArchiveDateKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildArchiveWindow(archiveDate: string | null) {
  if (!archiveDate) {
    return {
      startAt: new Date(Date.now() - 72 * 60 * 60_000),
      endAt: new Date(Date.now() + 24 * 60 * 60_000),
    };
  }

  const startOfDay = new Date(`${archiveDate}T00:00:00`);
  const endOfDay = new Date(`${archiveDate}T23:59:59.999`);

  return {
    startAt: new Date(startOfDay.getTime() - 6 * 60 * 60_000),
    endAt: new Date(endOfDay.getTime() + 6 * 60 * 60_000),
  };
}

export function ChannelWatchPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const [qualities, setQualities] = useState<QualityOption[]>([...defaultQualityOptions]);
  const [selectedQuality, setSelectedQuality] = useState("AUTO");
  const [recordingQuality, setRecordingQuality] = useState("AUTO");
  const [isPlayerMuted, setIsPlayerMuted] = useState(false);
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
  const selectedProgramId = searchParams.get("programId");
  const selectedArchiveDate = searchParams.get("archiveDate");
  const hasCatchupSelection = Boolean(selectedProgramId);
  const archiveWindow = useMemo(() => buildArchiveWindow(selectedArchiveDate), [selectedArchiveDate]);

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

  const streamSessionQuery = useQuery({
    queryKey: ["channel-stream-session", channelQuery.data?.id, token],
    queryFn: async () => {
      if (!channelQuery.data) {
        throw new Error("Missing channel context");
      }

      return (await api.getChannelStreamSessionStatus(channelQuery.data.id, token)).status;
    },
    enabled: Boolean(token && channelQuery.data?.id),
    refetchInterval: 10000,
  });

  const guideWindowQuery = useQuery({
    queryKey: ["guide-window", channelQuery.data?.id, token, archiveWindow.startAt.toISOString(), archiveWindow.endAt.toISOString()],
    queryFn: async () => {
      if (!token || !channelQuery.data) {
        throw new Error("Missing channel context");
      }

      return (
        await api.getChannelGuideWindow(
          channelQuery.data.id,
          archiveWindow.startAt.toISOString(),
          archiveWindow.endAt.toISOString(),
          token,
        )
      ).guide;
    },
    enabled: Boolean(token && channelQuery.data?.id),
  });

  const catchupPlaybackQuery = useQuery({
    queryKey: ["channel-program-playback", channelQuery.data?.id, selectedProgramId, token],
    queryFn: async () => {
      if (!token || !channelQuery.data || !selectedProgramId) {
        throw new Error("Missing catch-up playback context");
      }

      return (await api.getChannelProgramPlayback(channelQuery.data.id, selectedProgramId, token)).playback;
    },
    enabled: Boolean(token && channelQuery.data?.id && selectedProgramId),
    retry: false,
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
    if (!channelQuery.data || hasCatchupSelection) {
      return [];
    }

    const sessionSemantics = buildPlaybackSessionSemantics(playerDiagnostics);

    return [
      {
        sessionKey: `watch:${channelQuery.data.id}`,
        channelId: channelQuery.data.id,
        sessionType: "SINGLE_VIEW" as const,
        playbackState: sessionSemantics.playbackState,
        playbackPositionState: sessionSemantics.playbackPositionState,
        liveOffsetSeconds: sessionSemantics.liveOffsetSeconds,
        selectedQuality,
        isMuted: playerDiagnostics.isMuted,
        failureKind: playerDiagnostics.failureKind,
      },
    ];
  }, [channelQuery.data, hasCatchupSelection, playerDiagnostics.failureKind, playerDiagnostics.isMuted, playerDiagnostics.status, selectedQuality]);

  usePlaybackSessionHeartbeat(token, playbackSessionDescriptors);

  useEffect(() => {
    setQualities([...defaultQualityOptions]);
    setSelectedQuality("AUTO");
    setRecordingQuality("AUTO");
    setIsPlayerMuted(false);
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

  function selectCatchupProgram(programme: Pick<NowNextProgram, "id">) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("programId", programme.id);
    if ("start" in programme && typeof programme.start === "string") {
      nextParams.set("archiveDate", getArchiveDateKey(programme.start));
    }
    setSearchParams(nextParams, { replace: false });
  }

  function selectArchiveDate(date: string | null) {
    const nextParams = new URLSearchParams(searchParams);

    if (date) {
      nextParams.set("archiveDate", date);
    } else {
      nextParams.delete("archiveDate");
    }

    nextParams.delete("programId");
    setSearchParams(nextParams, { replace: false });
  }

  function returnToLivePlayback() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("programId");
    setSearchParams(nextParams, { replace: false });
  }

  if (!channelQuery.data) {
    return (
      <Panel>
        <p className="text-sm text-slate-400">Loading channel...</p>
      </Panel>
    );
  }

  const channel = channelQuery.data;
  const streamSessionStatus = streamSessionQuery.data ?? null;
  const timeshiftStatus: LiveTimeshiftStatus | null = streamSessionStatus?.timeshift ?? null;
  const catchupPlayback = catchupPlaybackQuery.data ?? null;
  const catchupPlaybackError =
    hasCatchupSelection && catchupPlaybackQuery.error instanceof Error ? catchupPlaybackQuery.error.message : null;
  const playbackTargets = getChannelPlaybackTargets(channel, {
    sessionStatus: streamSessionStatus,
    timeshiftStatus,
  });
  const livePlaybackUrl = playbackTargets.defaultPlaybackUrl ? resolveApiUrl(playbackTargets.defaultPlaybackUrl) : null;
  const playerTimeshiftUi = buildPlayerTimeshiftUiModel({
    diagnostics: playerDiagnostics,
    timeshiftStatus,
  });
  const nowNext = nowNextQuery.data;
  const guideProgrammes = guideWindowQuery.data?.programmes ?? [];
  const previousProgrammes = guideProgrammes.filter((programme) => programme.catchup?.timingState === "PREVIOUS");
  const upcomingProgrammes = guideProgrammes.filter((programme) => programme.catchup?.timingState === "UPCOMING");
  const currentGuideProgram =
    guideProgrammes.find((programme) => programme.id === nowNext?.now?.id) ??
    guideProgrammes.find((programme) => programme.catchup?.timingState === "LIVE_NOW") ??
    null;
  const selectedCatchupProgramme =
    guideProgrammes.find((programme) => programme.id === selectedProgramId) ??
    (catchupPlaybackQuery.data
      ? ({
          id: catchupPlaybackQuery.data.programId,
          sourceKind: "IMPORTED",
          title: catchupPlaybackQuery.data.title,
          subtitle: catchupPlaybackQuery.data.subtitle,
          description: catchupPlaybackQuery.data.description,
          category: catchupPlaybackQuery.data.category,
          imageUrl: catchupPlaybackQuery.data.imageUrl,
          start: catchupPlaybackQuery.data.startAt,
          stop: catchupPlaybackQuery.data.endAt,
          catchup: catchupPlaybackQuery.data.catchup,
        } satisfies NowNextProgram)
      : null);
  const isCatchupPlaybackActive = Boolean(selectedProgramId && catchupPlayback);
  const archivePlaybackUrl = catchupPlayback?.playbackUrl ? resolveApiUrl(catchupPlayback.playbackUrl) : null;
  const archivePosterUrl =
    catchupPlayback?.sourceType === "RECORDING" && selectedCatchupProgramme?.imageUrl
      ? resolveApiUrl(selectedCatchupProgramme.imageUrl)
      : undefined;
  const archiveMediaType = catchupPlayback?.sourceType === "TIMESHIFT" ? "HLS" : "FILE";
  const playbackUrl = isCatchupPlaybackActive ? archivePlaybackUrl : livePlaybackUrl;
  const activePlaybackProgramme = isCatchupPlaybackActive ? selectedCatchupProgramme : currentGuideProgram;
  const activePlaybackBadges = activePlaybackProgramme ? getProgramCatchupBadges(activePlaybackProgramme) : [];
  const activePlaybackCopy = activePlaybackProgramme ? getProgramCatchupCopy(activePlaybackProgramme) : null;
  const playablePreviousProgrammeCount = previousProgrammes.filter((programme) => programme.catchup?.isCatchupPlayable).length;
  const watchFromStartExpiresAt = formatAvailabilityTime(currentGuideProgram?.catchup?.availableUntilAt ?? null);
  const catchupAvailableUntil = formatAvailabilityTime(catchupPlayback?.availableUntilAt ?? null);

  return (
    <div className="space-y-4">
      <PageHeader
        density="compact"
        eyebrow="Single View"
        title={channel.name}
        description={
          hasCatchupSelection
            ? "Catch-up playback stays explicit about whether you are watching a linked recording or a retained DVR window."
            : "Real HLS playback with manual quality switching, optional proxy delivery, and live/catch-up guide context."
        }
        actions={
          <>
            {hasCatchupSelection ? (
              <Button className="w-full sm:w-auto" onClick={returnToLivePlayback} size="sm" variant="primary">
                Return to live
              </Button>
            ) : null}
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
            {isCatchupPlaybackActive ? (
              <ArchivePlayer
                autoPlay
                className="h-full"
                initialSeekSeconds={catchupPlayback?.startOffsetSeconds ?? 0}
                mediaType={archiveMediaType}
                posterUrl={archivePosterUrl}
                src={archivePlaybackUrl}
                title={selectedCatchupProgramme?.title ?? channel.name}
              />
            ) : hasCatchupSelection ? (
              <div className="flex h-full items-center justify-center rounded-[1.1rem] bg-black px-4 text-center">
                {catchupPlaybackQuery.isLoading ? (
                  <div className="rounded-2xl border border-slate-700/70 bg-slate-950/90 px-4 py-3 text-sm text-slate-100">
                    <div className="flex items-center gap-2">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Resolving a real playback source for this programme...
                    </div>
                  </div>
                ) : (
                  <div className="max-w-md rounded-2xl border border-rose-500/20 bg-slate-950/90 p-4 text-left">
                    <p className="text-sm font-semibold text-white">Catch-up playback is unavailable</p>
                    <p className="mt-1.5 text-[13px] text-slate-300">
                      {catchupPlaybackError ?? "TV-Dash could not resolve a linked recording or retained DVR window for this programme."}
                    </p>
                    <p className="mt-2 text-[12px] text-slate-500">
                      Use Return to live to go back to the channel feed, or try another earlier programme with a real source.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <HlsPlayer
                autoPlay
                fullscreenTargetRef={playerFrameRef}
                muted={isPlayerMuted}
                onMutedChange={setIsPlayerMuted}
                onQualityOptionsChange={setQualities}
                onSelectedQualityChange={setSelectedQuality}
                onDiagnosticsChange={setPlayerDiagnostics}
                preferredQuality={selectedQuality}
                src={playbackUrl}
                timeshiftStatus={timeshiftStatus}
                title={channel.name}
              />
            )}
          </div>

          <div className="mt-2 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {activePlaybackBadges.map((badge) => (
                <Badge className={getCatchupBadgeClassName(badge.tone)} key={badge.label} size="sm">
                  {badge.label}
                </Badge>
              ))}
              {isCatchupPlaybackActive ? (
                <Badge className="border-cyan-400/30 bg-cyan-500/10 text-cyan-100" size="sm">
                  {catchupPlayback?.sourceType === "RECORDING" ? "Archive recording" : "Retained DVR window"}
                </Badge>
              ) : null}
            </div>

            {isCatchupPlaybackActive && selectedCatchupProgramme ? (
              <>
                <p className="mt-2 text-sm font-semibold text-white">{selectedCatchupProgramme.title}</p>
                <p className="mt-1 text-[12px] text-slate-400">{formatProgrammeTimeWithDay(selectedCatchupProgramme)}</p>
                <p className="mt-2 text-[13px] text-slate-200">{getCatchupPlaybackKindLabel(catchupPlayback!)}</p>
                {activePlaybackCopy ? <p className="mt-1.5 text-[12px] text-slate-400">{activePlaybackCopy}</p> : null}
                {catchupPlayback?.recording ? (
                  <p className="mt-1.5 text-[12px] text-slate-400">
                    Source: recording {catchupPlayback.recording.title} ({catchupPlayback.recording.matchType.toLowerCase()} match)
                  </p>
                ) : null}
                {catchupPlayback?.timeshiftWindow ? (
                  <p className="mt-1.5 text-[12px] text-slate-400">
                    Source: retained DVR window from {formatAvailabilityTime(catchupPlayback.timeshiftWindow.availableFromAt)} until{" "}
                    {formatAvailabilityTime(catchupPlayback.timeshiftWindow.availableUntilAt)}
                  </p>
                ) : null}
                {catchupAvailableUntil ? (
                  <p className="mt-1.5 text-[11px] text-amber-200">Available until {catchupAvailableUntil}</p>
                ) : null}
              </>
            ) : hasCatchupSelection ? (
              <>
                <p className="mt-2 text-sm font-semibold text-white">Requested catch-up programme</p>
                <p className="mt-1.5 text-[13px] text-slate-300">
                  {catchupPlaybackQuery.isLoading
                    ? "TV-Dash is checking recordings and the retained DVR window before it starts playback."
                    : catchupPlaybackError ?? "No real catch-up source was available for this programme."}
                </p>
              </>
            ) : currentGuideProgram ? (
              <>
                <p className="mt-2 text-sm font-semibold text-white">{currentGuideProgram.title}</p>
                <p className="mt-1 text-[12px] text-slate-400">{formatProgrammeTimeWithDay(currentGuideProgram)}</p>
                {activePlaybackCopy ? <p className="mt-2 text-[12px] text-slate-300">{activePlaybackCopy}</p> : null}
                {currentGuideProgram.catchup?.watchFromStartAvailable ? (
                  <p className="mt-1.5 text-[11px] text-amber-200">
                    Watch from start is currently available{watchFromStartExpiresAt ? ` until ${watchFromStartExpiresAt}` : ""}.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm font-semibold text-white">Live playback</p>
                <p className="mt-1.5 text-[13px] text-slate-300">
                  Guide data is still loading, but the channel feed remains available.
                </p>
              </>
            )}
          </div>
        </Panel>

        <div className="grid gap-3 md:grid-cols-2 2xl:sticky 2xl:top-3 2xl:grid-cols-1 2xl:self-start">
          <Panel className="md:col-span-2 2xl:col-span-1" density="compact">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
              {hasCatchupSelection ? "Catch-up Controls" : "Playback Controls"}
            </p>
            <div className="mt-3 space-y-3">
              <div className={`grid gap-3 ${hasCatchupSelection ? "lg:grid-cols-[minmax(0,1fr)_auto]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"}`}>
                {hasCatchupSelection ? null : (
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
                )}
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
                {hasCatchupSelection ? (
                  <>
                    <p className="mt-1.5 text-[13px] text-slate-400">
                      {isCatchupPlaybackActive
                        ? getCatchupPlaybackKindLabel(catchupPlayback!)
                        : catchupPlaybackQuery.isLoading
                          ? "Resolving archive source"
                          : "Catch-up request could not be fulfilled"}
                    </p>
                    <p className="mt-1.5 text-[12px] text-slate-300">
                      {isCatchupPlaybackActive
                        ? catchupPlayback!.sourceType === "RECORDING"
                          ? "Playback is using a recording-backed archive source, which is preferred over the DVR window for stability."
                          : "Playback is using the retained DVR window because no preferred recording source was available."
                        : catchupPlaybackError ??
                          "This programme does not currently resolve to a linked recording or retained DVR window."}
                    </p>
                    {selectedCatchupProgramme ? (
                      <p className="mt-2 text-[12px] text-slate-400">
                        Programme: {selectedCatchupProgramme.title} · {formatProgrammeTimeWithDay(selectedCatchupProgramme)}
                      </p>
                    ) : null}
                    {catchupPlayback?.recording ? (
                      <p className="mt-1 text-[12px] text-slate-400">
                        Recording source: {catchupPlayback.recording.title} ({catchupPlayback.recording.matchType.toLowerCase()} match)
                      </p>
                    ) : null}
                    {catchupPlayback?.timeshiftWindow ? (
                      <p className="mt-1 text-[12px] text-slate-400">
                        Retained window: {formatAvailabilityTime(catchupPlayback.timeshiftWindow.availableFromAt)} to{" "}
                        {formatAvailabilityTime(catchupPlayback.timeshiftWindow.availableUntilAt)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[12px] text-slate-400">
                      Record now quality:{" "}
                      {qualities.find((option) => option.value === (recordingQuality === "AUTO" ? selectedQuality : recordingQuality))
                        ?.label ?? "Source default"}
                    </p>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Catch-up playback uses native archive controls and keeps live-edge diagnostics separate so the state never looks like live TV.
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {isPlayerFullscreen
                        ? "Fullscreen stays available for archive playback and returns to the same catch-up context when you exit."
                        : "Use fullscreen for cleaner archive viewing without losing the programme context."}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1.5 text-[13px] text-slate-400">
                      {playerDiagnostics.label} · {playerTimeshiftUi.viewerPositionLabel} ·{" "}
                      {selectedQuality === "AUTO" ? "Auto quality" : `Manual quality ${selectedQuality}`}
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
                      {streamSessionStatus?.message ??
                        (channel.playbackMode === "SHARED"
                          ? "Playback is routed through TV-Dash shared local delivery with per-channel edge caching."
                          : channel.playbackMode === "PROXY"
                            ? "Playback is routed through the TV-Dash stream gateway."
                            : "Playback uses the channel's direct upstream HLS URL.")}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Audio: {playerDiagnostics.isMuted ? "Muted by player" : `Live audio enabled at ${Math.round(playerDiagnostics.volume * 100)}%`}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Picture-in-Picture:{" "}
                      {playerDiagnostics.isPictureInPictureActive
                        ? "active now"
                        : playerDiagnostics.canPictureInPicture
                          ? "available from the in-player controls"
                          : "not available in this browser"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      DVR capability: {playerTimeshiftUi.capabilityLabel}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Viewer position: {playerTimeshiftUi.viewerPositionLabel}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Retained window: {playerTimeshiftUi.bufferWindowLabel}
                    </p>
                    {streamSessionStatus ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Session model:{" "}
                        {streamSessionStatus.sessionMode === "SHARED_DVR"
                          ? "shared relay + retained DVR window"
                          : streamSessionStatus.sessionMode === "SHARED_RELAY"
                            ? "shared relay only"
                            : streamSessionStatus.sessionMode === "PROXY_DVR"
                              ? "proxy relay + retained DVR window"
                              : streamSessionStatus.sessionMode === "PROXY_RELAY"
                                ? "proxy relay only"
                                : "direct upstream playback"}
                        {timeshiftStatus?.supported
                          ? ` · buffer acquisition ${timeshiftStatus.acquisitionMode === "SHARED_SESSION" ? "reuses the shared channel session" : "runs through TV-Dash-managed upstream polling"}`
                          : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-500">
                      {isPlayerFullscreen || playerDiagnostics.isFullscreenActive
                        ? "Fullscreen keeps the operator overlays visible and returns to the same state when you exit."
                        : "Use fullscreen for cleaner mobile viewing or large-screen monitoring without losing playback state."}
                    </p>
                  </>
                )}
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
                    {currentGuideProgram?.catchup?.watchFromStartAvailable ? (
                      <Button
                        disabled={selectedProgramId === currentGuideProgram.id}
                        onClick={() => selectCatchupProgram(currentGuideProgram)}
                        size="sm"
                        variant="ghost"
                      >
                        <PlayCircle className="h-4 w-4" />
                        {selectedProgramId === currentGuideProgram.id ? "Watching from start" : "Watch current from start"}
                      </Button>
                    ) : null}
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
                programmes={upcomingProgrammes}
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
              <p>Stream access · {getPlaybackModeLabel(channel.playbackMode)}</p>
              <p className="rounded-xl bg-slate-950/80 p-2.5 font-mono text-[11px] text-slate-300">
                {channel.playbackMode === "DIRECT" ? channel.masterHlsUrl : playbackUrl}
              </p>
              {streamSessionStatus?.bufferedPlaybackUrl ? (
                <p className="rounded-xl bg-slate-950/50 p-2.5 font-mono text-[11px] text-slate-500">
                  Buffered path · {resolveApiUrl(streamSessionStatus.bufferedPlaybackUrl)}
                </p>
              ) : null}
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

      <ChannelArchivePanel
        activeProgramId={isCatchupPlaybackActive && selectedCatchupProgramme?.catchup?.timingState === "PREVIOUS" ? selectedCatchupProgramme.id : null}
        isLoading={guideWindowQuery.isLoading}
        onPlayProgram={selectCatchupProgram}
        onSelectDate={selectArchiveDate}
        programmes={previousProgrammes}
        selectedDate={selectedArchiveDate}
      />

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
