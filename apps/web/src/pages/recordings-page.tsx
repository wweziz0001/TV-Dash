import { getCatchupBadges, getCatchupCopy } from "@/components/channels/channel-program-catchup-state";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecordingRuleInput, RecordingWeekday } from "@tv-dash/shared";
import {
  Clock3,
  CalendarClock,
  CircleDotDashed,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/layout/page-header";
import { RecordingOriginBadge, formatRecordingRuleRecurrence } from "@/components/recordings/recording-origin-badge";
import {
  buildRecordingForm,
  createEmptyRecordingForm,
  type RecordingFormIssue,
  validateRecordingForm,
} from "@/components/recordings/recording-form-state";
import {
  buildRecordingRuleForm,
  buildRecordingRuleProgramPrefill,
  createEmptyRecordingRuleForm,
  toggleRecordingRuleWeekday,
  type RecordingRuleFormIssue,
  validateRecordingRuleForm,
} from "@/components/recordings/recording-rule-form-state";
import {
  buildRecordingArchiveHref,
  buildRecordingLibrarySections,
  buildRecordingLibraryQueryParams,
  buildRecordingLibrarySummary,
  createDefaultRecordingLibraryFilters,
  filterRecordingLibraryJobs,
  type RecordingLibraryArchiveFilter,
  type RecordingLibraryFilters,
  type RecordingLibraryModeFilter,
  type RecordingLibraryProtectionFilter,
  type RecordingLibrarySortOption,
} from "@/components/recordings/recording-library-state";
import { RecordingRetentionBadge } from "@/components/recordings/recording-retention-badge";
import { RecordingStatusBadge } from "@/components/recordings/recording-status-badge";
import {
  buildRecordingActivityEvents,
  splitRecordingWorkspaceJobs,
  type RecordingActivityEvent,
  type RecordingActivityTone,
} from "@/components/recordings/recording-workspace-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-context";
import { api, resolveApiUrl } from "@/services/api";
import type {
  RecordingJob,
  RecordingJobStatus,
  RecordingQualityOption,
  RecordingRule,
} from "@/types/api";

const ACTIVE_RECORDING_STATUSES: RecordingJobStatus[] = ["PENDING", "SCHEDULED", "RECORDING"];
const RECORDING_ACTIVITY_STATUSES: RecordingJobStatus[] = [
  "RECORDING",
  "PENDING",
  "SCHEDULED",
  "COMPLETED",
  "FAILED",
  "CANCELED",
];
const RULE_WEEKDAYS: RecordingWeekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const PADDING_OPTIONS = [0, 1, 2, 5, 10, 15];

export function RecordingsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [now, setNow] = useState(() => Date.now());
  const [activeDialog, setActiveDialog] = useState<"JOB" | "RULE" | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [didApplyWorkflowPrefill, setDidApplyWorkflowPrefill] = useState(false);
  const [showJobValidation, setShowJobValidation] = useState(false);
  const [showRuleValidation, setShowRuleValidation] = useState(false);
  const [libraryFilters, setLibraryFilters] = useState<RecordingLibraryFilters>(() => createDefaultRecordingLibraryFilters());
  const [jobForm, setJobForm] = useState(() =>
    createEmptyRecordingForm({
      channelId: searchParams.get("channelId") ?? "",
      mode: normalizeRecordingMode(searchParams.get("mode")),
      ...buildDefaultWindow(normalizeRecordingMode(searchParams.get("mode"))),
    }),
  );
  const [ruleForm, setRuleForm] = useState(() =>
    createEmptyRecordingRuleForm({
      channelId: searchParams.get("channelId") ?? "",
      timeZone: resolveBrowserTimeZone(),
    }),
  );

  const channelsQuery = useQuery({
    queryKey: ["channels", token],
    queryFn: async () => (await api.listChannels(token)).channels,
    enabled: Boolean(token),
  });

  const jobQualityOptionsQuery = useQuery({
    queryKey: ["recording-qualities", "job", jobForm.channelId, token],
    queryFn: async () => {
      if (!token || !jobForm.channelId) {
        return [] satisfies RecordingQualityOption[];
      }

      return (await api.listRecordingQualities(jobForm.channelId, token)).qualities;
    },
    enabled: Boolean(token && jobForm.channelId),
  });

  const ruleQualityOptionsQuery = useQuery({
    queryKey: ["recording-qualities", "rule", ruleForm.channelId, token],
    queryFn: async () => {
      if (!token || !ruleForm.channelId) {
        return [] satisfies RecordingQualityOption[];
      }

      return (await api.listRecordingQualities(ruleForm.channelId, token)).qualities;
    },
    enabled: Boolean(token && ruleForm.channelId),
  });

  const activeJobsQuery = useQuery({
    queryKey: ["recordings-active", token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      const params = new URLSearchParams({
        status: ACTIVE_RECORDING_STATUSES.join(","),
      });

      return (await api.listRecordingJobs(token, params)).jobs;
    },
    enabled: Boolean(token),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  const recordingRulesQuery = useQuery({
    queryKey: ["recording-rules", token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      return (await api.listRecordingRules(token)).rules;
    },
    enabled: Boolean(token),
  });

  const libraryQueryParams = useMemo(() => {
    return buildRecordingLibraryQueryParams(libraryFilters);
  }, [libraryFilters]);

  const libraryJobsQuery = useQuery({
    queryKey: ["recordings-library", token, libraryQueryParams.toString()],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      return (await api.listRecordingJobs(token, libraryQueryParams)).jobs;
    },
    enabled: Boolean(token),
  });

  const recentActivityQuery = useQuery({
    queryKey: ["recordings-activity", token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      const params = new URLSearchParams({
        status: RECORDING_ACTIVITY_STATUSES.join(","),
        sort: "RECORDED_DESC",
      });

      return (await api.listRecordingJobs(token, params)).jobs;
    },
    enabled: Boolean(token),
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  });

  const jobValidation = validateRecordingForm(jobForm, {
    mode: editingJobId ? "update" : "create",
    qualityOptions: jobQualityOptionsQuery.data,
  });
  const ruleValidation = validateRecordingRuleForm(ruleForm, {
    qualityOptions: ruleQualityOptionsQuery.data,
  });

  const createOrUpdateJobMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      if (!jobValidation.isValid) {
        throw new Error(jobValidation.issues[0]?.message ?? "Fix the recording form issues before saving");
      }

      if (editingJobId && jobValidation.updatePayload) {
        return (await api.updateRecordingJob(editingJobId, jobValidation.updatePayload, token)).job;
      }

      if (jobValidation.createPayload) {
        return (await api.createRecordingJob(jobValidation.createPayload, token)).job;
      }

      throw new Error("Nothing to save");
    },
    onSuccess: async (job) => {
      toast.success(editingJobId ? "Recording schedule updated" : job.status === "RECORDING" ? "Recording started" : "Recording saved");
      resetJobEditor();
      setActiveDialog(null);
      await invalidateRecordingQueries(queryClient, token, job.id);
    },
    onError: (error) => {
      setShowJobValidation(true);
      toast.error(error instanceof Error ? error.message : "Unable to save recording");
    },
  });

  const createOrUpdateRuleMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      if (!ruleValidation.isValid || !ruleValidation.payload) {
        throw new Error(ruleValidation.issues[0]?.message ?? "Fix the recurring rule form issues before saving");
      }

      if (editingRuleId) {
        return (await api.updateRecordingRule(editingRuleId, ruleValidation.payload, token)).rule;
      }

      return (await api.createRecordingRule(ruleValidation.payload, token)).rule;
    },
    onSuccess: async (rule) => {
      toast.success(editingRuleId ? "Recurring rule updated" : "Recurring rule created");
      resetRuleEditor();
      setActiveDialog(null);
      await invalidateRecordingQueries(queryClient, token, rule.nextUpcomingJob?.id ?? null);
    },
    onError: (error) => {
      setShowRuleValidation(true);
      toast.error(error instanceof Error ? error.message : "Unable to save recurring rule");
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (job: RecordingJob) => {
      if (!token) {
        throw new Error("Missing session");
      }

      return (await api.stopRecordingJob(job.id, token)).job;
    },
    onSuccess: async (job) => {
      toast.success(job.status === "COMPLETED" ? "Recording stopped and saved" : "Recording stopped");
      await invalidateRecordingQueries(queryClient, token, job.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to stop recording");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (job: RecordingJob) => {
      if (!token) {
        throw new Error("Missing session");
      }

      return (await api.cancelRecordingJob(job.id, token)).job;
    },
    onSuccess: async (job) => {
      toast.success(job.mode === "RECURRING_RULE" ? "Recurring occurrence canceled" : "Scheduled recording canceled");
      if (editingJobId === job.id) {
        resetJobEditor();
      }
      await invalidateRecordingQueries(queryClient, token, job.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to cancel recording");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (job: RecordingJob) => {
      if (!token) {
        throw new Error("Missing session");
      }

      await api.deleteRecordingJob(job.id, token);
      return job;
    },
    onSuccess: async (job) => {
      toast.success("Recording removed from the library");
      if (editingJobId === job.id) {
        resetJobEditor();
      }
      await invalidateRecordingQueries(queryClient, token, job.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete recording");
    },
  });

  const toggleProtectionMutation = useMutation({
    mutationFn: async (job: RecordingJob) => {
      if (!token) {
        throw new Error("Missing session");
      }

      return (await api.updateRecordingRetention(job.id, !job.isProtected, token)).job;
    },
    onSuccess: async (job) => {
      toast.success(job.isProtected ? "Recording protected" : "Recording returned to automatic retention");
      await invalidateRecordingQueries(queryClient, token, job.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update recording retention");
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (rule: RecordingRule) => {
      if (!token) {
        throw new Error("Missing session");
      }

      await api.deleteRecordingRule(rule.id, token);
      return rule;
    },
    onSuccess: async (rule) => {
      toast.success("Recurring rule deleted");
      if (editingRuleId === rule.id) {
        resetRuleEditor();
        setActiveDialog(null);
      }
      await invalidateRecordingQueries(queryClient, token, rule.nextUpcomingJob?.id ?? null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete recurring rule");
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async (rule: RecordingRule) => {
      if (!token) {
        throw new Error("Missing session");
      }

      return (
        await api.updateRecordingRule(
          rule.id,
          buildRecordingRulePayloadFromRule(rule, {
            isActive: !rule.isActive,
          }),
          token,
        )
      ).rule;
    },
    onSuccess: async (rule) => {
      toast.success(rule.isActive ? "Recurring rule enabled" : "Recurring rule paused");
      await invalidateRecordingQueries(queryClient, token, rule.nextUpcomingJob?.id ?? null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update recurring rule");
    },
  });

  const activeJobs = useMemo(() => sortActiveRecordingJobs(activeJobsQuery.data ?? []), [activeJobsQuery.data]);
  const { activeJobs: currentlyRecordingJobs, upcomingJobs } = useMemo(
    () => splitRecordingWorkspaceJobs(activeJobs),
    [activeJobs],
  );
  const libraryJobs = libraryJobsQuery.data ?? [];
  const visibleLibraryJobs = useMemo(
    () => filterRecordingLibraryJobs(libraryJobs, libraryFilters.archiveAvailability),
    [libraryFilters.archiveAvailability, libraryJobs],
  );
  const librarySections = useMemo(() => buildRecordingLibrarySections(visibleLibraryJobs), [visibleLibraryJobs]);
  const librarySummary = useMemo(() => buildRecordingLibrarySummary(visibleLibraryJobs), [visibleLibraryJobs]);
  const activityEvents = useMemo(
    () => buildRecordingActivityEvents(recentActivityQuery.data ?? [], 18),
    [recentActivityQuery.data],
  );
  const recordingRules = recordingRulesQuery.data ?? [];
  const activeRuleCount = useMemo(() => recordingRules.filter((rule) => rule.isActive).length, [recordingRules]);
  const thumbnailReadyCount = useMemo(
    () => visibleLibraryJobs.filter((job) => Boolean(job.asset?.thumbnailGeneratedAt)).length,
    [visibleLibraryJobs],
  );
  const ruleProgramPrefill = useMemo(() => buildRulePrefillFromSearchParams(searchParams), [searchParams]);

  useEffect(() => {
    if (editingJobId) {
      return;
    }

    const nextMode = normalizeRecordingMode(searchParams.get("mode"));
    const nextChannelId = searchParams.get("channelId") ?? "";

    setJobForm((current) => ({
      ...current,
      channelId: current.channelId || nextChannelId,
      mode: current.mode === "IMMEDIATE" ? nextMode : current.mode,
      ...(!current.startAtLocal && !current.endAtLocal ? buildDefaultWindow(nextMode) : {}),
    }));
  }, [editingJobId, searchParams]);

  useEffect(() => {
    if (!ruleProgramPrefill || editingRuleId) {
      return;
    }

    setRuleForm((current) => {
      if (current.originProgramEntryId === ruleProgramPrefill.originProgramEntryId) {
        return current;
      }

      return {
        ...ruleProgramPrefill,
      };
    });
  }, [editingRuleId, ruleProgramPrefill]);

  useEffect(() => {
    if (didApplyWorkflowPrefill) {
      return;
    }

    const workflow = searchParams.get("workflow");
    const hasJobPrefill = Boolean(searchParams.get("channelId") || searchParams.get("mode"));

    if (workflow === "rule") {
      setActiveDialog("RULE");
      setDidApplyWorkflowPrefill(true);
      return;
    }

    if (hasJobPrefill) {
      setActiveDialog("JOB");
      setDidApplyWorkflowPrefill(true);
    }
  }, [didApplyWorkflowPrefill, searchParams]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!jobQualityOptionsQuery.data?.length) {
      return;
    }

    if (jobQualityOptionsQuery.data.some((option) => option.value === jobForm.requestedQualitySelector)) {
      return;
    }

    setJobForm((current) => ({
      ...current,
      requestedQualitySelector: "AUTO",
    }));
  }, [jobForm.requestedQualitySelector, jobQualityOptionsQuery.data]);

  useEffect(() => {
    if (!ruleQualityOptionsQuery.data?.length) {
      return;
    }

    if (ruleQualityOptionsQuery.data.some((option) => option.value === ruleForm.requestedQualitySelector)) {
      return;
    }

    setRuleForm((current) => ({
      ...current,
      requestedQualitySelector: "AUTO",
    }));
  }, [ruleForm.requestedQualitySelector, ruleQualityOptionsQuery.data]);

  function resetJobEditor() {
    const nextMode = normalizeRecordingMode(searchParams.get("mode"));

    setEditingJobId(null);
    setShowJobValidation(false);
    setJobForm(
      createEmptyRecordingForm({
        channelId: searchParams.get("channelId") ?? "",
        mode: nextMode,
        ...buildDefaultWindow(nextMode),
      }),
    );
  }

  function resetRuleEditor() {
    setEditingRuleId(null);
    setShowRuleValidation(false);
    setRuleForm(
      ruleProgramPrefill ??
        createEmptyRecordingRuleForm({
          channelId: searchParams.get("channelId") ?? "",
          timeZone: resolveBrowserTimeZone(),
        }),
    );
  }

  function handleJobEdit(job: RecordingJob) {
    setEditingJobId(job.id);
    setShowJobValidation(false);
    setJobForm(buildRecordingForm(job));
    setActiveDialog("JOB");
  }

  function handleRuleEdit(rule: RecordingRule) {
    setEditingRuleId(rule.id);
    setShowRuleValidation(false);
    setRuleForm(buildRecordingRuleForm(rule));
    setActiveDialog("RULE");
  }

  function handleModeChange(nextMode: "IMMEDIATE" | "TIMED" | "SCHEDULED") {
    setJobForm((current) => ({
      ...current,
      mode: nextMode,
      ...(current.startAtLocal || current.endAtLocal ? {} : buildDefaultWindow(nextMode)),
    }));
  }

  function updateLibraryFilters(patch: Partial<RecordingLibraryFilters>) {
    setLibraryFilters((current) => ({
      ...current,
      ...patch,
    }));
  }

  function openCreateJobDialog(mode: "IMMEDIATE" | "TIMED" | "SCHEDULED") {
    setEditingJobId(null);
    setShowJobValidation(false);
    setJobForm(
      createEmptyRecordingForm({
        channelId: searchParams.get("channelId") ?? "",
        mode,
        ...buildDefaultWindow(mode),
      }),
    );
    setActiveDialog("JOB");
  }

  function openCreateRuleDialog() {
    resetRuleEditor();
    setActiveDialog("RULE");
  }

  function closeJobDialog() {
    setShowJobValidation(false);
    if (editingJobId) {
      resetJobEditor();
    }
    setActiveDialog(null);
  }

  function closeRuleDialog() {
    setShowRuleValidation(false);
    if (editingRuleId) {
      resetRuleEditor();
    }
    setActiveDialog(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recordings"
        title="Recording operations workspace"
        description="Run recording jobs from the header, keep the library centered on playable media, and monitor recent execution events without mixing workflows together."
        actions={
          <Button
            onClick={() => {
              void invalidateRecordingQueries(queryClient, token, editingJobId);
            }}
            size="sm"
            variant="secondary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <Panel className="overflow-hidden" density="flush">
        <div className="border-b border-slate-800/80 px-4 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Active and upcoming jobs</p>
                <p className="mt-1.5 text-sm text-slate-400">
                  Launch recording tasks from here, keep active jobs in view, and scan the next scheduled captures without losing library context.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                <LibrarySummaryCard label="Recording now" value={String(currentlyRecordingJobs.length)} />
                <LibrarySummaryCard label="Upcoming" value={String(upcomingJobs.length)} />
                <LibrarySummaryCard label="Active rules" value={String(activeRuleCount)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => openCreateJobDialog("IMMEDIATE")} size="sm">
                <Plus className="h-4 w-4" />
                Record now
              </Button>
              <Button onClick={() => openCreateJobDialog("TIMED")} size="sm" variant="secondary">
                <CalendarClock className="h-4 w-4" />
                Create timed
              </Button>
              <Button onClick={() => openCreateJobDialog("SCHEDULED")} size="sm" variant="secondary">
                <CalendarClock className="h-4 w-4" />
                Schedule recording
              </Button>
              <Button onClick={openCreateRuleDialog} size="sm" variant="secondary">
                <CircleDotDashed className="h-4 w-4" />
                Add recurring
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-4 py-4 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold text-white">Recording now</p>
                <p className="text-[12px] text-slate-500">Live captures that need active monitoring and stop controls.</p>
              </div>
              <RecordingStatusBadge status="RECORDING" />
            </div>

            {activeJobsQuery.isLoading && !currentlyRecordingJobs.length ? (
              <EmptyState label="Loading active jobs..." />
            ) : !currentlyRecordingJobs.length ? (
              <EmptyState label="No recordings are running right now." />
            ) : (
              <div className="space-y-2">
                {currentlyRecordingJobs.map((job) => (
                  <OperationalJobCard
                    actions={
                      <Button onClick={() => stopMutation.mutate(job)} size="sm" variant="secondary">
                        <Square className="h-4 w-4" />
                        Stop
                      </Button>
                    }
                    job={job}
                    key={job.id}
                    now={now}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold text-white">Upcoming jobs</p>
                <p className="text-[12px] text-slate-500">Queued and scheduled work, including occurrences generated by recurring rules.</p>
              </div>
              <RecordingStatusBadge status="SCHEDULED" />
            </div>

            {activeJobsQuery.isLoading && !upcomingJobs.length ? (
              <EmptyState label="Loading upcoming jobs..." />
            ) : !upcomingJobs.length ? (
              <EmptyState label="No queued or scheduled jobs yet." />
            ) : (
              <div className="space-y-2">
                {upcomingJobs.map((job) => (
                  <OperationalJobCard
                    actions={
                      <>
                        {!job.recordingRule?.id ? (
                          <Button onClick={() => handleJobEdit(job)} size="sm" variant="secondary">
                            Edit
                          </Button>
                        ) : (
                          <Button
                            onClick={() => {
                              const rule = recordingRules.find((item) => item.id === job.recordingRule?.id);

                              if (rule) {
                                handleRuleEdit(rule);
                              }
                            }}
                            size="sm"
                            variant="secondary"
                          >
                            Open rule
                          </Button>
                        )}
                        <Button onClick={() => cancelMutation.mutate(job)} size="sm" variant="ghost">
                          Cancel
                        </Button>
                      </>
                    }
                    job={job}
                    key={job.id}
                    now={now}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden" density="flush">
        <div className="border-b border-slate-800/80 px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Recordings library</p>
              <p className="mt-1.5 text-sm text-slate-400">
                Browse completed recordings as a channel archive, with guide linkage, retained-window overlap, and original channel context surfaced alongside the media.
              </p>
            </div>
            <div className="text-[12px] text-slate-500">
              Retention defaults: {visibleLibraryJobs[0]?.retention.maxAgeDays ?? libraryJobs[0]?.retention.maxAgeDays ?? 30} days,
              newest {visibleLibraryJobs[0]?.retention.maxRecordingsPerChannel ?? libraryJobs[0]?.retention.maxRecordingsPerChannel ?? 25} per
              channel, failed cleanup after{" "}
              {visibleLibraryJobs[0]?.retention.failedCleanupHours ?? libraryJobs[0]?.retention.failedCleanupHours ?? 24} hours.
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <LibrarySummaryCard label="Visible media" value={String(librarySummary.total)} />
            <LibrarySummaryCard label="Program linked" value={String(librarySummary.programLinkedCount)} />
            <LibrarySummaryCard label="Catch-up overlap" value={String(librarySummary.catchupAvailableCount)} />
            <LibrarySummaryCard label="Protected" value={String(librarySummary.protectedCount)} />
            <LibrarySummaryCard label="Preview ready" value={String(thumbnailReadyCount)} />
            <LibrarySummaryCard label="Channels" value={String(new Set(visibleLibraryJobs.map((job) => job.channelId)).size)} />
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-800/80 px-4 py-4 lg:grid-cols-6">
          <Input
            onChange={(event) => updateLibraryFilters({ search: event.target.value })}
            placeholder="Search title, programme, channel, or filename"
            value={libraryFilters.search}
          />
          <Select
            onChange={(event) => updateLibraryFilters({ channelId: event.target.value })}
            value={libraryFilters.channelId}
          >
            <option value="">All channels</option>
            {(channelsQuery.data ?? []).map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => updateLibraryFilters({ mode: event.target.value as RecordingLibraryModeFilter })}
            value={libraryFilters.mode}
          >
            <option value="ALL">All origins</option>
            <option value="IMMEDIATE">Immediate</option>
            <option value="TIMED">Timed</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="EPG_PROGRAM">Guide programme</option>
            <option value="RECURRING_RULE">Recurring</option>
          </Select>
          <Select
            onChange={(event) =>
              updateLibraryFilters({ protection: event.target.value as RecordingLibraryProtectionFilter })
            }
            value={libraryFilters.protection}
          >
            <option value="ALL">All retention states</option>
            <option value="PROTECTED">Protected only</option>
            <option value="UNPROTECTED">Auto-retained only</option>
          </Select>
          <Select
            onChange={(event) =>
              updateLibraryFilters({ archiveAvailability: event.target.value as RecordingLibraryArchiveFilter })
            }
            value={libraryFilters.archiveAvailability}
          >
            <option value="ALL">All archive context</option>
            <option value="PROGRAM_LINKED">Program linked</option>
            <option value="CATCHUP_AVAILABLE">Catch-up also available</option>
            <option value="RECORDING_ONLY">Recording only</option>
          </Select>
          <Select
            onChange={(event) => updateLibraryFilters({ sort: event.target.value as RecordingLibrarySortOption })}
            value={libraryFilters.sort}
          >
            <option value="RECORDED_DESC">Newest first</option>
            <option value="RECORDED_ASC">Oldest first</option>
            <option value="TITLE_ASC">Title A-Z</option>
            <option value="TITLE_DESC">Title Z-A</option>
            <option value="CHANNEL_ASC">Channel A-Z</option>
          </Select>
        </div>

        <div className="grid gap-3 border-b border-slate-800/80 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Input
            onChange={(event) => updateLibraryFilters({ recordedFrom: event.target.value })}
            type="date"
            value={libraryFilters.recordedFrom}
          />
          <Input
            onChange={(event) => updateLibraryFilters({ recordedTo: event.target.value })}
            type="date"
            value={libraryFilters.recordedTo}
          />
          <Button onClick={() => setLibraryFilters(createDefaultRecordingLibraryFilters())} size="sm" variant="secondary">
            Clear filters
          </Button>
        </div>

        {libraryJobsQuery.isLoading && !libraryJobs.length ? (
          <EmptyState label="Loading recordings library..." />
        ) : !visibleLibraryJobs.length ? (
          <EmptyState label="No completed recordings match the current library filter." />
        ) : (
          <div className="space-y-4 px-4 py-4">
            {librarySections.map((section) => (
              <div className="space-y-3" key={section.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{section.label}</p>
                    <p className="text-[12px] text-slate-500">{section.jobs.length} archive entries in this section</p>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {section.jobs.map((job) => {
                    const archiveHref = buildRecordingArchiveHref(job);

                    return (
                      <RecordingCard
                        actions={
                          <>
                            {job.asset ? (
                              <Link to={`/recordings/${job.id}`}>
                                <Button size="sm" variant="secondary">
                                  <PlayCircle className="h-4 w-4" />
                                  Play
                                </Button>
                              </Link>
                            ) : null}
                            {archiveHref ? (
                              <Link to={archiveHref}>
                                <Button size="sm" variant="secondary">
                                  <Clock3 className="h-4 w-4" />
                                  Channel archive
                                </Button>
                              </Link>
                            ) : null}
                            <Button onClick={() => toggleProtectionMutation.mutate(job)} size="sm" variant="secondary">
                              {job.isProtected ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                              {job.isProtected ? "Auto retain" : "Keep forever"}
                            </Button>
                            <Button onClick={() => deleteMutation.mutate(job)} size="sm" variant="ghost">
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </>
                        }
                        job={job}
                        now={now}
                        key={job.id}
                        compact
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden" density="flush">
        <div className="border-b border-slate-800/80 px-4 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Recording activity log</p>
              <p className="mt-1.5 text-sm text-slate-400">
                Recent recording lifecycle events across scheduled, in-progress, completed, failed, and canceled jobs.
              </p>
            </div>
            <p className="text-[12px] text-slate-500">Newest activity first. This feed stays compact and scrollable.</p>
          </div>
        </div>

        {recentActivityQuery.isLoading && !activityEvents.length ? (
          <EmptyState label="Loading recording activity..." />
        ) : !activityEvents.length ? (
          <EmptyState label="No recording events yet." />
        ) : (
          <div className="max-h-[22rem] space-y-2 overflow-y-auto px-4 py-4">
            {activityEvents.map((event) => {
              const eventJob = recentActivityQuery.data?.find((job) => job.id === event.jobId) ?? null;

              return (
                <RecordingActivityEventCard
                  actions={
                    eventJob?.status === "COMPLETED" && eventJob.asset ? (
                      <Link to={`/recordings/${event.jobId}`}>
                        <Button size="sm" variant="secondary">
                          <PlayCircle className="h-4 w-4" />
                          Open
                        </Button>
                      </Link>
                    ) : eventJob?.recordingRule?.id ? (
                      <Button
                        onClick={() => {
                          const rule = recordingRules.find((item) => item.id === eventJob.recordingRule?.id);

                          if (rule) {
                            handleRuleEdit(rule);
                          }
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        Open rule
                      </Button>
                    ) : null
                  }
                  event={event}
                  key={event.id}
                />
              );
            })}
          </div>
        )}
      </Panel>

      <RecordingDialogShell
        description={
          editingJobId
            ? "Update the selected recording job without leaving the workspace."
            : jobForm.mode === "IMMEDIATE"
              ? "Start a live recording capture now."
              : jobForm.mode === "TIMED"
                ? "Create a timed one-off recording window."
                : "Schedule a recording ahead of time."
        }
        onClose={closeJobDialog}
        open={activeDialog === "JOB"}
        title={editingJobId ? "Edit recording job" : jobForm.mode === "IMMEDIATE" ? "Record now" : jobForm.mode === "TIMED" ? "Create timed recording" : "Schedule recording"}
      >
        <div className="space-y-4">
          <Field error={getFieldError(jobValidation.issues, "channelId", showJobValidation)} label="Channel" required>
            <Select
              onChange={(event) =>
                setJobForm((current) => ({
                  ...current,
                  channelId: event.target.value,
                  requestedQualitySelector: "AUTO",
                }))
              }
              value={jobForm.channelId}
            >
              <option value="">Select a channel</option>
              {(channelsQuery.data ?? []).map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <Field label="Mode">
              <Select
                onChange={(event) => handleModeChange(event.target.value as "IMMEDIATE" | "TIMED" | "SCHEDULED")}
                value={jobForm.mode}
              >
                <option value="IMMEDIATE">Record now</option>
                <option value="TIMED">Timed recording</option>
                <option value="SCHEDULED">Scheduled recording</option>
              </Select>
            </Field>

            <Field error={getFieldError(jobValidation.issues, "title", showJobValidation)} label="Title">
              <Input
                onChange={(event) => setJobForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Optional custom title"
                value={jobForm.title}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Recording quality">
              <Select
                disabled={!jobForm.channelId || jobQualityOptionsQuery.isLoading}
                onChange={(event) => setJobForm((current) => ({ ...current, requestedQualitySelector: event.target.value }))}
                value={resolveRecordingQualitySelection(jobForm.requestedQualitySelector, jobQualityOptionsQuery.data ?? [])}
              >
                {(jobQualityOptionsQuery.data ?? [{ value: "AUTO", label: "Source default", height: null }]).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Start early">
              <Select
                onChange={(event) => setJobForm((current) => ({ ...current, paddingBeforeMinutes: Number(event.target.value) }))}
                value={jobForm.paddingBeforeMinutes}
              >
                {PADDING_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes === 0 ? "No padding" : `${minutes} min`}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="End late">
              <Select
                onChange={(event) => setJobForm((current) => ({ ...current, paddingAfterMinutes: Number(event.target.value) }))}
                value={jobForm.paddingAfterMinutes}
              >
                {PADDING_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes === 0 ? "No padding" : `${minutes} min`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {jobForm.mode !== "IMMEDIATE" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field error={getFieldError(jobValidation.issues, "startAtLocal", showJobValidation)} label="Start" required>
                <Input
                  onChange={(event) => setJobForm((current) => ({ ...current, startAtLocal: event.target.value }))}
                  type="datetime-local"
                  value={jobForm.startAtLocal}
                />
              </Field>
              <Field error={getFieldError(jobValidation.issues, "endAtLocal", showJobValidation)} label="End" required>
                <Input
                  onChange={(event) => setJobForm((current) => ({ ...current, endAtLocal: event.target.value }))}
                  type="datetime-local"
                  value={jobForm.endAtLocal}
                />
              </Field>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 text-sm text-slate-400">
              Record-now mode starts capture as soon as the backend scheduler picks up the new job and keeps recording until you stop it from this workspace, the watch page, or a multiview tile.
            </div>
          )}

          {showJobValidation && jobValidation.issues.length ? (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {jobValidation.issues[0]?.message}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setShowJobValidation(true);
                createOrUpdateJobMutation.mutate();
              }}
              size="sm"
            >
              {editingJobId ? "Save recording job" : jobForm.mode === "IMMEDIATE" ? "Start recording" : "Save recording"}
            </Button>
            <Button onClick={closeJobDialog} size="sm" variant="secondary">
              Cancel
            </Button>
          </div>
        </div>
      </RecordingDialogShell>

      <RecordingDialogShell
        description="Create or maintain recurring recording automation without leaving the recordings workspace."
        onClose={closeRuleDialog}
        open={activeDialog === "RULE"}
        title={editingRuleId ? "Edit recurring rule" : "Add recurring recording"}
      >
        <div className="space-y-5">
          {ruleForm.originProgramEntryId ? (
            <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-100">
              Prefilled from guide programme{ruleForm.matchProgramTitle ? `: ${ruleForm.matchProgramTitle}` : ""}. Save this rule to keep generating future occurrences from the same channel and schedule pattern.
            </div>
          ) : null}

          <Field error={getFieldError(ruleValidation.issues, "channelId", showRuleValidation)} label="Channel" required>
            <Select
              onChange={(event) =>
                setRuleForm((current) => ({
                  ...current,
                  channelId: event.target.value,
                  requestedQualitySelector: "AUTO",
                }))
              }
              value={ruleForm.channelId}
            >
              <option value="">Select a channel</option>
              {(channelsQuery.data ?? []).map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <Field label="Repeat">
              <Select
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    recurrenceType: event.target.value as RecordingRule["recurrenceType"],
                    weekdays: event.target.value === "DAILY" ? [] : current.weekdays,
                  }))
                }
                value={ruleForm.recurrenceType}
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="WEEKDAYS">Selected weekdays</option>
              </Select>
            </Field>

            <Field error={getFieldError(ruleValidation.issues, "titleTemplate", showRuleValidation)} label="Rule title">
              <Input
                onChange={(event) => setRuleForm((current) => ({ ...current, titleTemplate: event.target.value }))}
                placeholder="Optional custom rule title"
                value={ruleForm.titleTemplate}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field error={getFieldError(ruleValidation.issues, "startsAtLocal", showRuleValidation)} label="First start" required>
              <Input
                onChange={(event) => setRuleForm((current) => ({ ...current, startsAtLocal: event.target.value }))}
                type="datetime-local"
                value={ruleForm.startsAtLocal}
              />
            </Field>

            <Field error={getFieldError(ruleValidation.issues, "durationMinutes", showRuleValidation)} label="Duration (minutes)">
              <Input
                min={5}
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    durationMinutes: Number(event.target.value) || 0,
                  }))
                }
                type="number"
                value={ruleForm.durationMinutes}
              />
            </Field>
          </div>

          {ruleForm.recurrenceType !== "DAILY" ? (
            <Field error={getFieldError(ruleValidation.issues, "weekdays", showRuleValidation)} label="Weekdays" required>
              <div className="flex flex-wrap gap-2">
                {RULE_WEEKDAYS.map((weekday) => {
                  const isSelected = ruleForm.weekdays.includes(weekday);

                  return (
                    <Button
                      key={weekday}
                      onClick={() =>
                        setRuleForm((current) => ({
                          ...current,
                          weekdays:
                            current.recurrenceType === "WEEKLY"
                              ? [weekday]
                              : toggleRecordingRuleWeekday(current.weekdays, weekday),
                        }))
                      }
                      size="sm"
                      type="button"
                      variant={isSelected ? "primary" : "secondary"}
                    >
                      {formatWeekdayLabel(weekday)}
                    </Button>
                  );
                })}
              </div>
            </Field>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Recording quality">
              <Select
                disabled={!ruleForm.channelId || ruleQualityOptionsQuery.isLoading}
                onChange={(event) => setRuleForm((current) => ({ ...current, requestedQualitySelector: event.target.value }))}
                value={resolveRecordingQualitySelection(ruleForm.requestedQualitySelector, ruleQualityOptionsQuery.data ?? [])}
              >
                {(ruleQualityOptionsQuery.data ?? [{ value: "AUTO", label: "Source default", height: null }]).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Start early">
              <Select
                onChange={(event) => setRuleForm((current) => ({ ...current, paddingBeforeMinutes: Number(event.target.value) }))}
                value={ruleForm.paddingBeforeMinutes}
              >
                {PADDING_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes === 0 ? "No padding" : `${minutes} min`}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="End late">
              <Select
                onChange={(event) => setRuleForm((current) => ({ ...current, paddingAfterMinutes: Number(event.target.value) }))}
                value={ruleForm.paddingAfterMinutes}
              >
                {PADDING_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes === 0 ? "No padding" : `${minutes} min`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
            <Field label="Programme match title">
              <Input
                onChange={(event) => setRuleForm((current) => ({ ...current, matchProgramTitle: event.target.value }))}
                placeholder="Optional future programme title match"
                value={ruleForm.matchProgramTitle}
              />
            </Field>

            <Field error={getFieldError(ruleValidation.issues, "timeZone", showRuleValidation)} label="Time zone" required>
              <Input
                onChange={(event) => setRuleForm((current) => ({ ...current, timeZone: event.target.value }))}
                value={ruleForm.timeZone}
              />
            </Field>
          </div>

          <Field label="Rule state">
            <Select
              onChange={(event) => setRuleForm((current) => ({ ...current, isActive: event.target.value === "active" }))}
              value={ruleForm.isActive ? "active" : "paused"}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </Select>
          </Field>

          {showRuleValidation && ruleValidation.issues.length ? (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {ruleValidation.issues[0]?.message}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setShowRuleValidation(true);
                createOrUpdateRuleMutation.mutate();
              }}
              size="sm"
            >
              {editingRuleId ? "Save recurring rule" : "Create recurring rule"}
            </Button>
            <Button onClick={closeRuleDialog} size="sm" variant="secondary">
              Cancel
            </Button>
          </div>

          <div className="border-t border-slate-800/80 pt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Recurring rules</p>
                <p className="mt-1 text-[12px] text-slate-500">Edit, pause, or delete automation rules from the same dialog.</p>
              </div>
              {editingRuleId ? (
                <Button onClick={resetRuleEditor} size="sm" variant="secondary">
                  Reset form
                </Button>
              ) : null}
            </div>

            {recordingRulesQuery.isLoading && !recordingRules.length ? (
              <EmptyState label="Loading recurring rules..." />
            ) : !recordingRules.length ? (
              <EmptyState label="No recurring rules yet." />
            ) : (
              <div className="max-h-[18rem] space-y-2 overflow-y-auto pr-1">
                {recordingRules.map((rule) => (
                  <RecordingRuleCard
                    actions={
                      <>
                        <Button onClick={() => handleRuleEdit(rule)} size="sm" variant="secondary">
                          Edit
                        </Button>
                        <Button onClick={() => toggleRuleMutation.mutate(rule)} size="sm" variant="secondary">
                          {rule.isActive ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                          {rule.isActive ? "Pause" : "Enable"}
                        </Button>
                        <Button onClick={() => deleteRuleMutation.mutate(rule)} size="sm" variant="ghost">
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </>
                    }
                    highlighted={editingRuleId === rule.id}
                    key={rule.id}
                    rule={rule}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </RecordingDialogShell>
    </div>
  );
}

function RecordingCard({
  job,
  actions,
  now,
  compact = false,
}: {
  job: RecordingJob;
  actions?: ReactNode;
  now: number;
  compact?: boolean;
}) {
  const startedAt = job.actualStartAt ?? job.startAt;
  const endedAt = job.actualEndAt ?? job.endAt;
  const displayDurationSeconds =
    job.status === "RECORDING" && startedAt
      ? Math.max(
          job.asset?.durationSeconds ?? job.latestRun?.durationSeconds ?? 0,
          Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)),
        )
      : job.asset?.durationSeconds ?? job.latestRun?.durationSeconds ?? null;
  const displayFileSizeBytes = job.asset?.fileSizeBytes ?? job.latestRun?.fileSizeBytes ?? null;
  const isRecording = job.status === "RECORDING";
  const timingLabel = isRecording ? "Started" : "Starts";
  const thumbnailUrl = job.asset?.thumbnailUrl ? resolveApiUrl(job.asset.thumbnailUrl) : null;
  const deleteAfterLabel = job.retention.deleteAfter ? formatDateTime(job.retention.deleteAfter) : null;
  const archiveBadges = getCatchupBadges(job.archiveContext?.catchup ?? null);
  const archiveCopy = getCatchupCopy(job.archiveContext?.catchup ?? null);

  return (
    <div className={cn("rounded-2xl border border-slate-800/80 bg-slate-950/70", compact ? "p-3" : "p-4")}>
      <div className={cn("grid gap-3", compact ? "xl:grid-cols-[160px_minmax(0,1fr)]" : "xl:grid-cols-[220px_minmax(0,1fr)_auto]")}>
        <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/80">
          {thumbnailUrl ? (
            <img alt={`${job.title} preview`} className="aspect-video h-full w-full object-cover" src={thumbnailUrl} />
          ) : (
            <div className="flex aspect-video items-center justify-center px-4 text-center text-[12px] text-slate-500">
              {job.asset ? "Preview available when thumbnail extraction succeeds." : "No playable media preview yet."}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {archiveBadges.length ? (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {archiveBadges.map((badge) => (
                <span
                  className={`rounded-full border px-2 py-1 text-[11px] ${badge.tone === "positive" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : badge.tone === "warning" ? "border-amber-400/30 bg-amber-500/10 text-amber-100" : badge.tone === "live" ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-slate-700/80 bg-slate-900/80 text-slate-300"}`}
                  key={`${job.id}-${badge.label}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{job.title}</p>
            <RecordingStatusBadge status={job.status} />
            <RecordingOriginBadge mode={job.mode} />
            <RecordingRetentionBadge job={job} />
          </div>
          <p className="mt-1.5 text-[13px] text-slate-400">
            {job.channelNameSnapshot} · {timingLabel} {formatDateTime(startedAt)}
            {job.endAt ? ` · Ends ${formatDateTime(job.endAt)}` : ""}
          </p>

          <div className={cn("mt-3 grid gap-2", compact ? "sm:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4")}>
            <MetadataPill
              label={isRecording ? "Elapsed" : "Duration"}
              value={displayDurationSeconds !== null ? formatDuration(displayDurationSeconds) : "Pending"}
            />
            <MetadataPill
              label={isRecording ? "Captured" : "File size"}
              value={displayFileSizeBytes !== null ? formatFileSize(displayFileSizeBytes) : "Pending"}
            />
            <MetadataPill label="Recorded" value={formatDateTime(startedAt)} />
            {!compact ? <MetadataPill label="Quality" value={job.requestedQualityLabel ?? "Source default"} /> : null}
          </div>

          {job.program?.title ? (
            <p className="mt-3 text-[12px] text-fuchsia-100">
              Guide programme: {job.program.title}
              {job.program.category ? ` · ${job.program.category}` : ""}
              {job.program.startAt ? ` · ${formatDateTime(job.program.startAt)}` : ""}
            </p>
          ) : null}
          {job.archiveContext ? (
            <p className="mt-1 text-[12px] text-slate-400">
              Archive window: {formatDateTime(job.archiveContext.startAt)}
              {job.archiveContext.endAt ? ` to ${formatDateTime(job.archiveContext.endAt)}` : ""}
              {job.archiveContext.hasProgramLink ? " · linked to guide history" : " · snapshot-only archive context"}
            </p>
          ) : null}
          {archiveCopy ? <p className="mt-1 text-[12px] text-slate-300">{archiveCopy}</p> : null}
          {!compact && job.program?.description ? <p className="mt-1 text-[12px] text-slate-400">{job.program.description}</p> : null}
          {job.recordingRule?.titleTemplate ? (
            <p className="mt-1 text-[12px] text-amber-100">
              Recurring rule: {job.recordingRule.titleTemplate}
              {job.recordingRule.recurrenceType ? ` · ${formatRecordingRuleRecurrence(job.recordingRule as RecordingRule)}` : ""}
            </p>
          ) : null}
          <p className="mt-2 text-[12px] text-slate-500">
            Quality: {job.requestedQualityLabel ?? "Source default"} · padding {job.paddingBeforeMinutes}/{job.paddingAfterMinutes} min
          </p>
          {job.asset?.storagePath ? <p className="mt-1 text-[12px] text-slate-500">Storage: {job.asset.storagePath}</p> : null}
          {deleteAfterLabel ? (
            <p className="mt-1 text-[12px] text-slate-500">
              {job.isProtected ? "Protected from cleanup" : `Eligible for cleanup after ${deleteAfterLabel}`}
            </p>
          ) : null}
          {endedAt && job.status === "COMPLETED" ? (
            <p className="mt-2 text-[12px] text-slate-500">Completed at {formatDateTime(endedAt)}</p>
          ) : null}
          {compact && actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {!compact && actions ? <div className="flex flex-wrap content-start gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function LibrarySummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function MetadataPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-[12px] text-slate-200">{value}</p>
    </div>
  );
}

function RecordingRuleCard({
  rule,
  actions,
  highlighted = false,
}: {
  rule: RecordingRule;
  actions?: ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4",
        highlighted && "border-cyan-300/40 bg-cyan-500/5",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{rule.titleTemplate}</p>
            <span
              className={`rounded-full border px-2 py-1 text-[11px] ${
                rule.isActive
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                  : "border-slate-700/80 bg-slate-900/80 text-slate-300"
              }`}
            >
              {rule.isActive ? "Active" : "Paused"}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-slate-400">
            {rule.channel.name} · {formatRecordingRuleRecurrence(rule)} · Starts {formatDateTime(rule.startsAt)}
          </p>
          <p className="mt-1 text-[12px] text-slate-500">
            {rule.durationMinutes} min · {rule.timeZone} · padding {rule.paddingBeforeMinutes}/{rule.paddingAfterMinutes} min
          </p>
          {rule.matchProgramTitle ? (
            <p className="mt-1 text-[12px] text-fuchsia-100">Programme match title: {rule.matchProgramTitle}</p>
          ) : null}
          {rule.originProgram?.title ? (
            <p className="mt-1 text-[12px] text-fuchsia-100">
              Origin programme: {rule.originProgram.title}
              {rule.originProgram.startAt ? ` · ${formatDateTime(rule.originProgram.startAt)}` : ""}
            </p>
          ) : null}
          {rule.nextUpcomingJob ? (
            <p className="mt-1.5 text-[12px] text-slate-300">
              Next job: {rule.nextUpcomingJob.title} · {rule.nextUpcomingJob.status.toLowerCase()} · {formatDateTime(rule.nextUpcomingJob.startAt)}
            </p>
          ) : (
            <p className="mt-1.5 text-[12px] text-slate-500">
              {rule.isActive ? "No upcoming generated job is currently in the scheduling window." : "Paused rules do not generate future jobs."}
            </p>
          )}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function RecordingDialogShell({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[min(92vh,56rem)] w-full max-w-[1100px] flex-col rounded-[1.5rem] border border-slate-800/90 bg-slate-900/95 p-4 shadow-glow sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-accent/80">Recording setup</p>
            <h2 className="mt-1.5 text-xl font-semibold text-white">{title}</h2>
            <p className="mt-1.5 text-[13px] text-slate-400">{description}</p>
          </div>
          <Button className="shrink-0" onClick={onClose} size="sm" variant="ghost">
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

function OperationalJobCard({
  job,
  now,
  actions,
}: {
  job: RecordingJob;
  now: number;
  actions?: ReactNode;
}) {
  const startedAt = job.actualStartAt ?? job.startAt;
  const durationSeconds =
    job.status === "RECORDING" && startedAt
      ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
      : job.asset?.durationSeconds ?? job.latestRun?.durationSeconds ?? null;

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{job.title}</p>
            <RecordingStatusBadge status={job.status} />
            <RecordingOriginBadge mode={job.mode} />
          </div>
          <p className="mt-1 text-[12px] text-slate-400">
            {job.channelNameSnapshot} · {formatJobWindowLabel(job)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-slate-500">
            {durationSeconds !== null ? <span>Duration {formatDuration(durationSeconds)}</span> : null}
            {job.program?.title ? <span>Programme {job.program.title}</span> : null}
            {job.recordingRule?.titleTemplate ? <span>Rule {job.recordingRule.titleTemplate}</span> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function RecordingActivityEventCard({
  event,
  actions,
}: {
  event: RecordingActivityEvent;
  actions?: ReactNode;
}) {
  const toneClasses = getRecordingActivityToneClasses(event.tone);

  return (
    <div className={cn("rounded-2xl border px-3 py-3", toneClasses.container)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex rounded-full px-2 py-1 text-[11px] font-medium", toneClasses.badge)}>
              {event.label}
            </span>
            <RecordingOriginBadge mode={event.mode} />
            {event.isProtected ? (
              <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100">
                Protected
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-white">{event.title}</p>
          <p className="mt-1 text-[12px] text-slate-400">
            {event.channelName} · {formatDateTime(event.timestamp)}
          </p>
          <p className="mt-1 text-[12px] text-slate-500">{event.detail}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-slate-400">
        {label} {required ? <span className="text-rose-300">*</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-[12px] text-amber-200">{error}</span> : null}
    </label>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center text-sm text-slate-400">{label}</div>;
}

function getRecordingActivityToneClasses(tone: RecordingActivityTone) {
  switch (tone) {
    case "success":
      return {
        container: "border-emerald-400/20 bg-emerald-500/5",
        badge: "bg-emerald-500/10 text-emerald-100",
      };
    case "failure":
      return {
        container: "border-amber-400/20 bg-amber-500/5",
        badge: "bg-amber-500/10 text-amber-100",
      };
    case "active":
      return {
        container: "border-cyan-300/20 bg-cyan-500/5",
        badge: "bg-cyan-500/10 text-cyan-100",
      };
    case "scheduled":
    default:
      return {
        container: "border-slate-700/80 bg-slate-950/70",
        badge: "bg-slate-800/90 text-slate-200",
      };
  }
}

function formatJobWindowLabel(job: RecordingJob) {
  if (job.status === "RECORDING") {
    return `Started ${formatDateTime(job.actualStartAt ?? job.startAt)}${job.endAt ? ` · Ends ${formatDateTime(job.endAt)}` : ""}`;
  }

  return `Starts ${formatDateTime(job.startAt)}${job.endAt ? ` · Ends ${formatDateTime(job.endAt)}` : ""}`;
}

function getFieldError(
  issues: Array<RecordingFormIssue | RecordingRuleFormIssue>,
  field: RecordingFormIssue["field"] | RecordingRuleFormIssue["field"],
  showValidation: boolean,
) {
  if (!showValidation) {
    return null;
  }

  return issues.find((issue) => issue.field === field)?.message ?? null;
}

function normalizeRecordingMode(value: string | null) {
  if (value === "TIMED" || value === "SCHEDULED") {
    return value;
  }

  return "IMMEDIATE" as const;
}

function buildDefaultWindow(mode: "IMMEDIATE" | "TIMED" | "SCHEDULED") {
  if (mode === "IMMEDIATE") {
    return {
      startAtLocal: "",
      endAtLocal: "",
    };
  }

  const now = new Date();
  const startAt = new Date(now.getTime() + (mode === "SCHEDULED" ? 60 * 60 * 1000 : 5 * 60 * 1000));
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  return {
    startAtLocal: toLocalDateTime(startAt),
    endAtLocal: toLocalDateTime(endAt),
  };
}

function buildRulePrefillFromSearchParams(searchParams: URLSearchParams) {
  const workflow = searchParams.get("workflow");
  const channelId = searchParams.get("channelId");
  const programId = searchParams.get("programId");
  const programTitle = searchParams.get("programTitle");
  const startAt = searchParams.get("startAt");
  const endAt = searchParams.get("endAt");

  if (workflow !== "rule" || !channelId || !programId || !programTitle || !startAt || !endAt) {
    return null;
  }

  return buildRecordingRuleProgramPrefill({
    channelId,
    programId,
    programTitle,
    startAt,
    endAt,
    timeZone: resolveBrowserTimeZone(),
  });
}

function buildRecordingRulePayloadFromRule(
  rule: RecordingRule,
  overrides: Partial<RecordingRuleInput> = {},
): RecordingRuleInput {
  return {
    channelId: rule.channelId,
    titleTemplate: rule.titleTemplate,
    recurrenceType: rule.recurrenceType,
    weekdays: rule.weekdays,
    startsAt: rule.startsAt,
    durationMinutes: rule.durationMinutes,
    timeZone: rule.timeZone,
    originProgramEntryId: rule.originProgram?.id ?? null,
    matchProgramTitle: rule.matchProgramTitle,
    paddingBeforeMinutes: rule.paddingBeforeMinutes,
    paddingAfterMinutes: rule.paddingAfterMinutes,
    requestedQualitySelector: rule.requestedQualitySelector,
    requestedQualityLabel: rule.requestedQualityLabel,
    isActive: rule.isActive,
    ...overrides,
  };
}

function toLocalDateTime(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function sortActiveRecordingJobs(jobs: RecordingJob[]) {
  const priority: Record<RecordingJobStatus, number> = {
    RECORDING: 0,
    PENDING: 1,
    SCHEDULED: 2,
    COMPLETED: 3,
    FAILED: 4,
    CANCELED: 5,
  };

  return [...jobs].sort((left, right) => {
    const priorityDifference = priority[left.status] - priority[right.status];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(durationSeconds: number) {
  const normalizedDurationSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(normalizedDurationSeconds / 3600);
  const minutes = Math.floor((normalizedDurationSeconds % 3600) / 60);
  const seconds = normalizedDurationSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatFileSize(fileSizeBytes: number) {
  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`;
  }

  if (fileSizeBytes < 1024 * 1024) {
    return `${Math.round(fileSizeBytes / 1024)} KB`;
  }

  if (fileSizeBytes < 1024 * 1024 * 1024) {
    return `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function resolveRecordingQualitySelection(selectedValue: string, options: RecordingQualityOption[]) {
  if (options.some((option) => option.value === selectedValue)) {
    return selectedValue;
  }

  return "AUTO";
}

function resolveBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatWeekdayLabel(weekday: RecordingWeekday) {
  return weekday.slice(0, 1) + weekday.slice(1, 3).toLowerCase();
}

async function invalidateRecordingQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  token: string | null,
  recordingJobId: string | null,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["recordings-active", token] }),
    queryClient.invalidateQueries({ queryKey: ["recordings-activity", token] }),
    queryClient.invalidateQueries({ queryKey: ["recordings-library", token] }),
    queryClient.invalidateQueries({ queryKey: ["recording", recordingJobId, token] }),
    queryClient.invalidateQueries({ queryKey: ["recording-rules", token] }),
  ]);
}
