import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayCircle, RefreshCw, Square, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/layout/page-header";
import {
  buildRecordingForm,
  createEmptyRecordingForm,
  type RecordingFormIssue,
  validateRecordingForm,
} from "@/components/recordings/recording-form-state";
import { RecordingStatusBadge } from "@/components/recordings/recording-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/services/api";
import type { RecordingJob, RecordingJobStatus, RecordingQualityOption } from "@/types/api";

const ACTIVE_RECORDING_STATUSES: RecordingJobStatus[] = ["PENDING", "SCHEDULED", "RECORDING"];
const DEFAULT_LIBRARY_STATUSES: RecordingJobStatus[] = ["COMPLETED", "FAILED", "CANCELED"];

export function RecordingsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [form, setForm] = useState(() =>
    createEmptyRecordingForm({
      channelId: searchParams.get("channelId") ?? "",
      mode: normalizeRecordingMode(searchParams.get("mode")),
      ...buildDefaultWindow(normalizeRecordingMode(searchParams.get("mode"))),
    }),
  );
  const [showValidation, setShowValidation] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<"ALL" | RecordingJobStatus>("ALL");

  const channelsQuery = useQuery({
    queryKey: ["channels", token],
    queryFn: async () => (await api.listChannels(token)).channels,
    enabled: Boolean(token),
  });

  const recordingQualitiesQuery = useQuery({
    queryKey: ["recording-qualities", form.channelId, token],
    queryFn: async () => {
      if (!token || !form.channelId) {
        return [] satisfies RecordingQualityOption[];
      }

      return (await api.listRecordingQualities(form.channelId, token)).qualities;
    },
    enabled: Boolean(token && form.channelId),
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
    refetchInterval: 5000,
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

  useEffect(() => {
    if (editingJobId) {
      return;
    }

    const nextMode = normalizeRecordingMode(searchParams.get("mode"));
    const nextChannelId = searchParams.get("channelId") ?? "";

    setForm((current) => ({
      ...current,
      channelId: current.channelId || nextChannelId,
      mode: current.mode === "IMMEDIATE" ? nextMode : current.mode,
      ...(!current.startAtLocal && !current.endAtLocal ? buildDefaultWindow(nextMode) : {}),
    }));
  }, [editingJobId, searchParams]);

  useEffect(() => {
    if (!recordingQualitiesQuery.data?.length) {
      return;
    }

    if (recordingQualitiesQuery.data.some((option) => option.value === form.requestedQualitySelector)) {
      return;
    }

    setForm((current) => ({
      ...current,
      requestedQualitySelector: "AUTO",
    }));
  }, [form.requestedQualitySelector, recordingQualitiesQuery.data]);

  const validation = validateRecordingForm(form, {
    mode: editingJobId ? "update" : "create",
    qualityOptions: recordingQualitiesQuery.data,
  });

  const createOrUpdateMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      if (!validation.isValid) {
        const [firstIssue] = validation.issues;
        throw new Error(firstIssue?.message ?? "Fix the recording form issues before saving");
      }

      if (editingJobId && validation.updatePayload) {
        return (await api.updateRecordingJob(editingJobId, validation.updatePayload, token)).job;
      }

      if (validation.createPayload) {
        return (await api.createRecordingJob(validation.createPayload, token)).job;
      }

      throw new Error("Nothing to save");
    },
    onSuccess: async (job) => {
      toast.success(editingJobId ? "Recording schedule updated" : job.status === "RECORDING" ? "Recording started" : "Recording saved");
      resetEditor();
      await invalidateRecordingQueries(queryClient, token, job.id);
    },
    onError: (error) => {
      setShowValidation(true);
      toast.error(error instanceof Error ? error.message : "Unable to save recording");
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
      toast.success("Scheduled recording canceled");
      if (editingJobId === job.id) {
        resetEditor();
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
        resetEditor();
      }
      await invalidateRecordingQueries(queryClient, token, job.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete recording");
    },
  });

  const activeJobs = useMemo(() => sortActiveRecordingJobs(activeJobsQuery.data ?? []), [activeJobsQuery.data]);
  const libraryJobs = libraryJobsQuery.data ?? [];

  function resetEditor() {
    const nextMode = normalizeRecordingMode(searchParams.get("mode"));

    setEditingJobId(null);
    setShowValidation(false);
    setForm(
      createEmptyRecordingForm({
        channelId: searchParams.get("channelId") ?? "",
        mode: nextMode,
        ...buildDefaultWindow(nextMode),
      }),
    );
  }

  function handleEdit(job: RecordingJob) {
    setEditingJobId(job.id);
    setShowValidation(false);
    setForm(buildRecordingForm(job));
  }

  function handleModeChange(nextMode: "IMMEDIATE" | "TIMED" | "SCHEDULED") {
    setForm((current) => ({
      ...current,
      mode: nextMode,
      ...(current.startAtLocal || current.endAtLocal ? {} : buildDefaultWindow(nextMode)),
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recordings"
        title="Recording workflows and library"
        description="Start a live recording now, schedule timed windows ahead of time, monitor active capture, and open completed media from one operator-facing workspace."
        actions={
          <Button
            onClick={() => {
              void Promise.all([
                invalidateRecordingQueries(queryClient, token, editingJobId),
                queryClient.invalidateQueries({ queryKey: ["channels", token] }),
              ]);
            }}
            size="sm"
            variant="secondary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
        <Panel className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                {editingJobId ? "Edit Schedule" : "Create Recording"}
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                Immediate recordings start now, timed recordings use an explicit window, and scheduled recordings keep future-only operator intent clear. The backend is also ready for future program-driven jobs.
              </p>
            </div>
            {editingJobId ? (
              <Button onClick={resetEditor} size="sm" variant="secondary">
                Clear edit
              </Button>
            ) : null}
          </div>

          <Field error={getFieldError(validation.issues, "channelId", showValidation)} label="Channel" required>
            <Select
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  channelId: event.target.value,
                  requestedQualitySelector: "AUTO",
                }))
              }
              value={form.channelId}
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
              <Select onChange={(event) => handleModeChange(event.target.value as "IMMEDIATE" | "TIMED" | "SCHEDULED")} value={form.mode}>
                <option value="IMMEDIATE">Record now</option>
                <option value="TIMED">Timed recording</option>
                <option value="SCHEDULED">Scheduled recording</option>
              </Select>
            </Field>

            <Field error={getFieldError(validation.issues, "title", showValidation)} label="Title">
              <Input
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Optional custom title"
                value={form.title}
              />
            </Field>
          </div>

          <Field label="Recording quality">
            <Select
              disabled={!form.channelId || recordingQualitiesQuery.isLoading}
              onChange={(event) => setForm((current) => ({ ...current, requestedQualitySelector: event.target.value }))}
              value={resolveRecordingQualitySelection(form.requestedQualitySelector, recordingQualitiesQuery.data ?? [])}
            >
              {(recordingQualitiesQuery.data ?? [{ value: "AUTO", label: "Source default", height: null }]).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          {form.mode !== "IMMEDIATE" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field error={getFieldError(validation.issues, "startAtLocal", showValidation)} label="Start" required>
                <Input
                  onChange={(event) => setForm((current) => ({ ...current, startAtLocal: event.target.value }))}
                  type="datetime-local"
                  value={form.startAtLocal}
                />
              </Field>
              <Field error={getFieldError(validation.issues, "endAtLocal", showValidation)} label="End" required>
                <Input
                  onChange={(event) => setForm((current) => ({ ...current, endAtLocal: event.target.value }))}
                  type="datetime-local"
                  value={form.endAtLocal}
                />
              </Field>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 text-sm text-slate-400">
              Record-now mode starts capture as soon as the backend scheduler picks up the new job and keeps recording until you stop it from this page, the watch page, or a multi-view tile.
            </div>
          )}

          {showValidation && validation.issues.length ? (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {validation.issues[0]?.message}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setShowValidation(true);
                createOrUpdateMutation.mutate();
              }}
              size="sm"
            >
              {editingJobId ? "Save schedule" : form.mode === "IMMEDIATE" ? "Start recording" : "Save recording"}
            </Button>
            {editingJobId ? (
              <Button onClick={resetEditor} size="sm" variant="secondary">
                Cancel edit
              </Button>
            ) : null}
          </div>
        </Panel>

        <Panel className="overflow-hidden" density="flush">
          <div className="border-b border-slate-800/80 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Active and upcoming</p>
            <p className="mt-1.5 text-sm text-slate-400">
              Immediate recordings, live timed captures, and future scheduled windows stay visible here with stop, edit, and cancel actions.
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
                          <Button onClick={() => handleEdit(job)} size="sm" variant="secondary">
                            Edit
                          </Button>
                          <Button onClick={() => cancelMutation.mutate(job)} size="sm" variant="ghost">
                            Cancel
                          </Button>
                        </>
                      )}
                    </>
                  }
                  job={job}
                  key={job.id}
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
}: {
  job: RecordingJob;
  actions?: ReactNode;
}) {
  const startedAt = job.actualStartAt ?? job.startAt;
  const endedAt = job.actualEndAt ?? job.endAt;
  const displayDurationSeconds = job.asset?.durationSeconds ?? job.latestRun?.durationSeconds ?? null;
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
          </div>
          <p className="mt-1.5 text-[13px] text-slate-400">
            {job.channelNameSnapshot} · {formatRecordingMode(job.mode)} · {timingLabel} {formatDateTime(startedAt)}
            {job.endAt ? ` · Ends ${formatDateTime(job.endAt)}` : ""}
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

function getFieldError(issues: RecordingFormIssue[], field: RecordingFormIssue["field"], showValidation: boolean) {
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

function formatRecordingMode(mode: RecordingJob["mode"]) {
  if (mode === "IMMEDIATE") {
    return "Record now";
  }

  if (mode === "TIMED") {
    return "Timed";
  }

  if (mode === "SCHEDULED") {
    return "Scheduled";
  }

  return "Program";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(durationSeconds: number) {
  if (durationSeconds < 60) {
    return `${durationSeconds}s`;
  }

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.round((durationSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatFileSize(fileSizeBytes: number) {
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

async function invalidateRecordingQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  token: string | null,
  recordingJobId: string | null,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["recordings-active", token] }),
    queryClient.invalidateQueries({ queryKey: ["recordings-library", token] }),
    queryClient.invalidateQueries({ queryKey: ["recording", recordingJobId, token] }),
  ]);
}
