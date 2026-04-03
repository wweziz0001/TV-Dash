import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecordingRuleInput, RecordingWeekday } from "@tv-dash/shared";
import { PauseCircle, PlayCircle, RefreshCw, Square, Trash2 } from "lucide-react";
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
import { RecordingStatusBadge } from "@/components/recordings/recording-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/services/api";
import type {
  RecordingJob,
  RecordingJobStatus,
  RecordingQualityOption,
  RecordingRule,
} from "@/types/api";

const ACTIVE_RECORDING_STATUSES: RecordingJobStatus[] = ["PENDING", "SCHEDULED", "RECORDING"];
const DEFAULT_LIBRARY_STATUSES: RecordingJobStatus[] = ["COMPLETED", "FAILED", "CANCELED"];
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
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [showJobValidation, setShowJobValidation] = useState(false);
  const [showRuleValidation, setShowRuleValidation] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<"ALL" | RecordingJobStatus>("ALL");
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
    const params = new URLSearchParams({
      status: (libraryStatusFilter === "ALL" ? DEFAULT_LIBRARY_STATUSES : [libraryStatusFilter]).join(","),
    });

    if (librarySearch.trim()) {
      params.set("search", librarySearch.trim());
    }

    return params;
  }, [librarySearch, libraryStatusFilter]);

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
  const libraryJobs = libraryJobsQuery.data ?? [];
  const recordingRules = recordingRulesQuery.data ?? [];
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
  }

  function handleRuleEdit(rule: RecordingRule) {
    setEditingRuleId(rule.id);
    setShowRuleValidation(false);
    setRuleForm(buildRecordingRuleForm(rule));
  }

  function handleModeChange(nextMode: "IMMEDIATE" | "TIMED" | "SCHEDULED") {
    setJobForm((current) => ({
      ...current,
      mode: nextMode,
      ...(current.startAtLocal || current.endAtLocal ? {} : buildDefaultWindow(nextMode)),
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recordings"
        title="Guide-driven recordings and recurring rules"
        description="Run one-off recordings, create guide-linked programme captures, manage daily or weekly recurring rules, and keep the resulting jobs and library in one operator-facing workspace."
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                {editingJobId ? "Edit Recording Job" : "One-Off Recording"}
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                Start an immediate capture, save a timed window, or schedule a one-off recording ahead of time. Guide-program recordings show up here with their linked programme context after you create them from the watch page.
              </p>
            </div>
            {editingJobId ? (
              <Button onClick={resetJobEditor} size="sm" variant="secondary">
                Clear edit
              </Button>
            ) : null}
          </div>

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
              <Select onChange={(event) => handleModeChange(event.target.value as "IMMEDIATE" | "TIMED" | "SCHEDULED")} value={jobForm.mode}>
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
              Record-now mode starts capture as soon as the backend scheduler picks up the new job and keeps recording until you stop it from this page, the watch page, or a multi-view tile.
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
            {editingJobId ? (
              <Button onClick={resetJobEditor} size="sm" variant="secondary">
                Cancel edit
              </Button>
            ) : null}
          </div>
        </Panel>

        <Panel className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                {editingRuleId ? "Edit Recurring Rule" : "Recurring Recording Rule"}
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                Create daily, weekly, or selected-weekday rules that generate real upcoming recording jobs. When you come from a guide programme, the rule keeps that originating programme and title match as its series-like foundation.
              </p>
            </div>
            {editingRuleId ? (
              <Button onClick={resetRuleEditor} size="sm" variant="secondary">
                Clear edit
              </Button>
            ) : null}
          </div>

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
            {editingRuleId ? (
              <Button onClick={resetRuleEditor} size="sm" variant="secondary">
                Cancel edit
              </Button>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel className="overflow-hidden" density="flush">
          <div className="border-b border-slate-800/80 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Active and upcoming jobs</p>
            <p className="mt-1.5 text-sm text-slate-400">
              Immediate recordings, guide-program captures, and recurring-rule occurrences stay visible here with stop, cancel, and contextual actions.
            </p>
          </div>
          {activeJobsQuery.isLoading && !activeJobs.length ? (
            <EmptyState label="Loading recording activity..." />
          ) : !activeJobs.length ? (
            <EmptyState label="No active or upcoming recording jobs yet." />
          ) : (
            <div className="space-y-3 px-4 py-4">
              {activeJobs.map((job) => (
                <RecordingCard
                  actions={
                    <>
                      {job.status === "RECORDING" ? (
                        <Button onClick={() => stopMutation.mutate(job)} size="sm" variant="secondary">
                          <Square className="h-4 w-4" />
                          Stop
                        </Button>
                      ) : (
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
                      )}
                    </>
                  }
                  job={job}
                  now={now}
                  key={job.id}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel className="overflow-hidden" density="flush">
          <div className="border-b border-slate-800/80 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Recurring rules</p>
            <p className="mt-1.5 text-sm text-slate-400">
              Daily, weekly, and selected-weekday rules generate real upcoming jobs. Pause a rule to stop future job generation without deleting its recording history.
            </p>
          </div>
          {recordingRulesQuery.isLoading && !recordingRules.length ? (
            <EmptyState label="Loading recurring rules..." />
          ) : !recordingRules.length ? (
            <EmptyState label="No recurring recording rules yet." />
          ) : (
            <div className="space-y-3 px-4 py-4">
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
                  key={rule.id}
                  rule={rule}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel className="overflow-hidden" density="flush">
        <div className="grid gap-3 border-b border-slate-800/80 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <Input
            onChange={(event) => setLibrarySearch(event.target.value)}
            placeholder="Search recordings by title or channel"
            value={librarySearch}
          />
          <Select onChange={(event) => setLibraryStatusFilter(event.target.value as "ALL" | RecordingJobStatus)} value={libraryStatusFilter}>
            <option value="ALL">All library statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELED">Canceled</option>
          </Select>
        </div>

        {libraryJobsQuery.isLoading && !libraryJobs.length ? (
          <EmptyState label="Loading recordings library..." />
        ) : !libraryJobs.length ? (
          <EmptyState label="No recordings match the current library filter." />
        ) : (
          <div className="space-y-3 px-4 py-4">
            {libraryJobs.map((job) => (
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
                    <Button onClick={() => deleteMutation.mutate(job)} size="sm" variant="ghost">
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </>
                }
                job={job}
                now={now}
                key={job.id}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function RecordingCard({
  job,
  actions,
  now,
}: {
  job: RecordingJob;
  actions?: ReactNode;
  now: number;
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
  const durationLabel =
    displayDurationSeconds !== null
      ? `${isRecording ? "Elapsed" : "Recorded"} ${formatDuration(displayDurationSeconds)}`
      : isRecording
        ? "Elapsed 0s"
        : "Duration pending";
  const fileSizeLabel =
    displayFileSizeBytes !== null
      ? `${isRecording ? "Captured" : "File size"} ${formatFileSize(displayFileSizeBytes)}`
      : isRecording
        ? "Captured 0 KB"
        : "File size pending";

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{job.title}</p>
            <RecordingStatusBadge status={job.status} />
            <RecordingOriginBadge mode={job.mode} />
          </div>
          <p className="mt-1.5 text-[13px] text-slate-400">
            {job.channelNameSnapshot} · {timingLabel} {formatDateTime(startedAt)}
            {job.endAt ? ` · Ends ${formatDateTime(job.endAt)}` : ""}
          </p>
          {job.program?.title ? (
            <p className="mt-1 text-[12px] text-fuchsia-100">
              Guide programme: {job.program.title}
              {job.program.startAt ? ` · ${formatDateTime(job.program.startAt)}` : ""}
            </p>
          ) : null}
          {job.recordingRule?.titleTemplate ? (
            <p className="mt-1 text-[12px] text-amber-100">
              Recurring rule: {job.recordingRule.titleTemplate}
              {job.recordingRule.recurrenceType ? ` · ${formatRecordingRuleRecurrence(job.recordingRule as RecordingRule)}` : ""}
            </p>
          ) : null}
          <p className="mt-1 text-[12px] text-slate-500">
            Padding: start {job.paddingBeforeMinutes} min early · end {job.paddingAfterMinutes} min late
          </p>
          {job.requestedQualityLabel ? (
            <p className="mt-1 text-[12px] text-slate-500">Recording quality: {job.requestedQualityLabel}</p>
          ) : null}
          <p className="mt-1.5 text-[13px] text-slate-500">{durationLabel} · {fileSizeLabel}</p>
          {job.failureReason ? <p className="mt-2 text-[13px] text-amber-200">Failure: {job.failureReason}</p> : null}
          {job.cancellationReason ? <p className="mt-2 text-[13px] text-slate-400">Canceled: {job.cancellationReason}</p> : null}
          {endedAt && job.status === "COMPLETED" ? (
            <p className="mt-2 text-[12px] text-slate-500">Completed at {formatDateTime(endedAt)}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function RecordingRuleCard({
  rule,
  actions,
}: {
  rule: RecordingRule;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
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
    queryClient.invalidateQueries({ queryKey: ["recordings-library", token] }),
    queryClient.invalidateQueries({ queryKey: ["recording", recordingJobId, token] }),
    queryClient.invalidateQueries({ queryKey: ["recording-rules", token] }),
  ]);
}
