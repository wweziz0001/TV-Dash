import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Clock3, Pencil, Plus, Trash2 } from "lucide-react";
import type { ProgramEntryInput } from "@tv-dash/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/text-area";
import type { Channel, ProgramEntry } from "@/types/api";
import {
  buildManualProgramForm,
  createEmptyManualProgramForm,
  getManualProgramStatus,
  hasManualProgramFormChanges,
  validateManualProgramForm,
  weekdayOptions,
  type ManualProgramFormField,
} from "./manual-program-form-state";

interface ChannelManualProgramManagerProps {
  channels: Channel[];
  programs: ProgramEntry[];
  isLoading?: boolean;
  isSaving?: boolean;
  selectedChannelId: string;
  onSelectedChannelIdChange: (channelId: string) => void;
  onCreate: (payload: ProgramEntryInput) => Promise<void>;
  onCreateMany: (payloads: ProgramEntryInput[]) => Promise<void>;
  onUpdate: (id: string, payload: ProgramEntryInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function ChannelManualProgramManager({
  channels,
  programs,
  isLoading = false,
  isSaving = false,
  selectedChannelId,
  onSelectedChannelIdChange,
  onCreate,
  onCreateMany,
  onUpdate,
  onDelete,
}: ChannelManualProgramManagerProps) {
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [form, setForm] = useState(createEmptyManualProgramForm());

  useEffect(() => {
    setEditingProgramId(null);
    setAttemptedSave(false);
    setForm(createEmptyManualProgramForm());
  }, [selectedChannelId]);

  useEffect(() => {
    if (!editingProgramId) {
      return;
    }

    const editingProgram = programs.find((program) => program.id === editingProgramId);

    if (!editingProgram) {
      setEditingProgramId(null);
      setAttemptedSave(false);
      setForm(createEmptyManualProgramForm());
    }
  }, [editingProgramId, programs]);

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) ?? null;
  const validation = validateManualProgramForm({
    channelId: selectedChannelId,
    form,
    existingPrograms: programs,
    editingProgramId,
  });
  const showValidation = attemptedSave || hasManualProgramFormChanges(form);
  const scheduleGroups = buildScheduleGroups(programs);
  const nextUpcoming = programs.find((program) => getManualProgramStatus(program) === "upcoming") ?? null;
  const liveProgram = programs.find((program) => getManualProgramStatus(program) === "live") ?? null;

  async function handleSave() {
    setAttemptedSave(true);

    if (!validation.isValid || !validation.payload) {
      return;
    }

    if (editingProgramId) {
      await onUpdate(editingProgramId, validation.payload);
    } else if (form.mode === "recurring") {
      await onCreateMany(validation.generatedPayloads);
    } else {
      await onCreate(validation.payload);
    }

    setEditingProgramId(null);
    setAttemptedSave(false);
    setForm(createEmptyManualProgramForm());
  }

  async function handleDelete(programId: string) {
    setDeletingProgramId(programId);

    try {
      await onDelete(programId);

      if (editingProgramId === programId) {
        setEditingProgramId(null);
        setAttemptedSave(false);
        setForm(createEmptyManualProgramForm());
      }
    } finally {
      setDeletingProgramId(null);
    }
  }

  function handleStartEdit(program: ProgramEntry) {
    setEditingProgramId(program.id);
    setAttemptedSave(false);
    setForm(buildManualProgramForm(program));
  }

  function handleReset() {
    setEditingProgramId(null);
    setAttemptedSave(false);
    setForm(createEmptyManualProgramForm());
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <Panel density="compact">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Manual channel schedule</p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {selectedChannel ? selectedChannel.name : "Select a channel"}
            </h2>
            <p className="mt-1.5 text-sm text-slate-400">
              Browse, edit, and remove manual programme rows for one channel at a time.
            </p>
          </div>

          <div className="w-full max-w-xs">
            <Field label="Channel">
              <Select
                aria-label="Manual programme channel"
                onChange={(event) => onSelectedChannelIdChange(event.target.value)}
                uiSize="sm"
                value={selectedChannelId}
              >
                <option value="">Select a channel</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SummaryCard label="Entries" value={`${programs.length}`} />
          <SummaryCard label="On now" value={liveProgram?.title ?? "None"} />
          <SummaryCard label="Next up" value={nextUpcoming?.title ?? "None"} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {selectedChannel
              ? "Manual rows override imported guide data during overlapping windows and feed now/next directly."
              : "Choose a channel to manage its manual programme schedule."}
          </div>
          <Button onClick={handleReset} size="sm" variant="secondary">
            <Plus className="h-4 w-4" />
            New entry
          </Button>
        </div>

        {!selectedChannel ? (
          <EmptyState
            message="Select a channel to open its schedule and manage manual programme entries."
            title="No channel selected"
          />
        ) : isLoading ? (
          <EmptyState message="Loading stored manual programme rows for this channel." title="Loading schedule" />
        ) : programs.length === 0 ? (
          <EmptyState
            message="This channel does not have any manual programme rows yet. Add the first entry from the form."
            title="No manual entries yet"
          />
        ) : (
          <div className="mt-4 space-y-4">
            {scheduleGroups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{group.label}</p>
                  <p className="text-[11px] text-slate-500">{group.items.length} item(s)</p>
                </div>

                <div className="mt-2 space-y-3">
                  {group.items.map((program) => (
                    <ProgramRow
                      key={program.id}
                      deleting={deletingProgramId === program.id}
                      editing={editingProgramId === program.id}
                      onDelete={() => void handleDelete(program.id)}
                      onEdit={() => handleStartEdit(program)}
                      program={program}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="space-y-4" density="compact">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
              {editingProgramId ? "Edit manual programme" : "Add manual programme"}
            </p>
            <p className="mt-1.5 text-sm text-slate-400">
              {selectedChannel
                ? `Working on ${selectedChannel.name}. Times use the local browser timezone and save to the guide in UTC.`
                : "Select a channel first, then enter the programme timing and metadata."}
            </p>
          </div>
          {validation.durationMinutes !== null ? <Badge>{validation.durationMinutes} min</Badge> : null}
        </div>

        {!editingProgramId ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              onClick={() => setForm((current) => ({ ...current, mode: "single" }))}
              type="button"
              variant={form.mode === "single" ? "primary" : "secondary"}
            >
              Single entry
            </Button>
            <Button
              onClick={() => setForm((current) => ({ ...current, mode: "recurring" }))}
              type="button"
              variant={form.mode === "recurring" ? "primary" : "secondary"}
            >
              Repeat on days
            </Button>
          </div>
        ) : null}

        {showValidation && validation.issues.length > 0 ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-200" />
              <div>
                <p className="text-sm font-semibold text-rose-50">Fix the highlighted schedule issues</p>
                <ul className="mt-1 space-y-1 text-sm text-rose-100/90">
                  {validation.issues.map((issue) => (
                    <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {validation.overlappingPrograms.length > 0 ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
            <p className="text-sm font-semibold text-amber-100">Conflicting manual rows on this channel</p>
            <div className="mt-2 space-y-2">
              {validation.overlappingPrograms.map((overlap) => (
                <div
                  key={`${overlap.program.id}-${overlap.payload.startAt}`}
                  className="rounded-xl border border-amber-300/20 bg-slate-950/40 p-2.5"
                >
                  <p className="text-sm font-semibold text-white">{overlap.program.title}</p>
                  <p className="mt-1 text-xs text-slate-300">
                    Existing: {formatProgramDateTime(overlap.program.startAt)} to {formatProgramDateTime(overlap.program.endAt)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Generated: {formatProgramDateTime(overlap.payload.startAt)} to {formatProgramDateTime(overlap.payload.endAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <Field error={getFieldError(validation.issues, "title", showValidation)} label="Title" required>
            <Input
              aria-label="Title *"
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Morning bulletin"
              uiSize="sm"
              value={form.title}
            />
          </Field>
          <Field error={getFieldError(validation.issues, "category", showValidation)} label="Category / type">
            <Input
              aria-label="Category / type"
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              placeholder="News"
              uiSize="sm"
              value={form.category}
            />
          </Field>
        </div>

        {form.mode === "single" || editingProgramId ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field error={getFieldError(validation.issues, "startAtLocal", showValidation)} label="Start" required>
              <Input
                aria-label="Start *"
                onChange={(event) => setForm((current) => ({ ...current, startAtLocal: event.target.value }))}
                type="datetime-local"
                uiSize="sm"
                value={form.startAtLocal}
              />
            </Field>
            <Field error={getFieldError(validation.issues, "endAtLocal", showValidation)} label="End" required>
              <Input
                aria-label="End *"
                onChange={(event) => setForm((current) => ({ ...current, endAtLocal: event.target.value }))}
                type="datetime-local"
                uiSize="sm"
                value={form.endAtLocal}
              />
            </Field>
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/40 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field error={getFieldError(validation.issues, "rangeStartDate", showValidation)} label="Repeat from" required>
                <Input
                  aria-label="Repeat from *"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      recurrence: {
                        ...current.recurrence,
                        rangeStartDate: event.target.value,
                      },
                    }))
                  }
                  type="date"
                  uiSize="sm"
                  value={form.recurrence.rangeStartDate}
                />
              </Field>
              <Field error={getFieldError(validation.issues, "rangeEndDate", showValidation)} label="Repeat until" required>
                <Input
                  aria-label="Repeat until *"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      recurrence: {
                        ...current.recurrence,
                        rangeEndDate: event.target.value,
                      },
                    }))
                  }
                  type="date"
                  uiSize="sm"
                  value={form.recurrence.rangeEndDate}
                />
              </Field>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field error={getFieldError(validation.issues, "startTimeLocal", showValidation)} label="Start time" required>
                <Input
                  aria-label="Start time *"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      recurrence: {
                        ...current.recurrence,
                        startTimeLocal: event.target.value,
                      },
                    }))
                  }
                  type="time"
                  uiSize="sm"
                  value={form.recurrence.startTimeLocal}
                />
              </Field>
              <Field error={getFieldError(validation.issues, "endTimeLocal", showValidation)} label="End time" required>
                <Input
                  aria-label="End time *"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      recurrence: {
                        ...current.recurrence,
                        endTimeLocal: event.target.value,
                      },
                    }))
                  }
                  type="time"
                  uiSize="sm"
                  value={form.recurrence.endTimeLocal}
                />
              </Field>
            </div>

            <Field error={getFieldError(validation.issues, "weekdays", showValidation)} label="Repeat days" required>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {weekdayOptions.map((weekday) => {
                  const isSelected = form.recurrence.weekdays.includes(weekday.value);

                  return (
                    <Button
                      key={weekday.value}
                      aria-pressed={isSelected}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          recurrence: {
                            ...current.recurrence,
                            weekdays: isSelected
                              ? current.recurrence.weekdays.filter((value) => value !== weekday.value)
                              : [...current.recurrence.weekdays, weekday.value].sort((left, right) => left - right),
                          },
                        }))
                      }
                      size="sm"
                      type="button"
                      variant={isSelected ? "primary" : "secondary"}
                    >
                      {weekday.label}
                    </Button>
                  );
                })}
              </div>
            </Field>

            <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs text-slate-400">
              {validation.generatedPayloads.length > 0
                ? `This will generate ${validation.generatedPayloads.length} manual programme entr${validation.generatedPayloads.length === 1 ? "y" : "ies"}.`
                : "Pick a date range, start/end time, and one or more repeat days to generate entries automatically."}
            </div>
          </div>
        )}

        <Field label="Description">
          <TextArea
            aria-label="Description"
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Optional operational note or programme synopsis."
            rows={4}
            value={form.description}
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-2">
          <Field error={getFieldError(validation.issues, "subtitle", showValidation)} label="Subtitle">
            <Input
              aria-label="Subtitle"
              onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))}
              placeholder="Optional subtitle"
              uiSize="sm"
              value={form.subtitle}
            />
          </Field>
          <Field error={getFieldError(validation.issues, "imageUrl", showValidation)} label="Image URL">
            <Input
              aria-label="Image URL"
              onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))}
              placeholder="https://example.com/poster.jpg"
              uiSize="sm"
              value={form.imageUrl}
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Button disabled={!selectedChannel || isSaving} onClick={() => void handleSave()} type="button">
            {editingProgramId ? "Update programme" : form.mode === "recurring" ? "Generate programme entries" : "Save programme"}
          </Button>
          <Button onClick={handleReset} type="button" variant="secondary">
            {editingProgramId ? "Cancel edit" : "Clear form"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function ProgramRow({
  program,
  editing,
  deleting,
  onEdit,
  onDelete,
}: {
  program: ProgramEntry;
  editing: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = getManualProgramStatus(program);

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-white">{program.title}</p>
            <StatusBadge status={status} />
            {program.category ? <Badge size="sm">{program.category}</Badge> : null}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
            <Clock3 className="h-4 w-4 text-slate-500" />
            {formatProgramDateTime(program.startAt)} to {formatProgramDateTime(program.endAt)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatProgramTimeRange(program)}</p>
          {program.subtitle ? <p className="mt-2 text-sm text-slate-300">{program.subtitle}</p> : null}
          {program.description ? <p className="mt-2 text-sm text-slate-500">{program.description}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onEdit} size="sm" variant={editing ? "primary" : "secondary"}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button disabled={deleting} onClick={onDelete} size="sm" variant="danger">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof getManualProgramStatus> }) {
  if (status === "live") {
    return <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-100">Live</Badge>;
  }

  if (status === "upcoming") {
    return <Badge className="border-cyan-400/30 bg-cyan-500/10 text-cyan-100">Upcoming</Badge>;
  }

  if (status === "ended") {
    return <Badge className="border-slate-700/80 bg-slate-900/80 text-slate-300">Ended</Badge>;
  }

  return <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-100">Unknown</Badge>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1.5 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/40 p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/70">
        <CalendarClock className="h-5 w-5 text-slate-500" />
      </div>
      <p className="mt-3 text-sm font-semibold text-white">{title}</p>
      <p className="mt-1.5 text-sm text-slate-400">{message}</p>
    </div>
  );
}

function Field({
  label,
  children,
  error,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | null;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
        {required ? " *" : ""}
      </label>
      {children}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

function getFieldError(
  issues: Array<{ field: ManualProgramFormField; message: string }>,
  field: ManualProgramFormField,
  showValidation: boolean,
) {
  if (!showValidation) {
    return null;
  }

  return issues.find((issue) => issue.field === field)?.message ?? null;
}

function buildScheduleGroups(programs: ProgramEntry[]) {
  const groups: Array<{ key: string; label: string; items: ProgramEntry[] }> = [];

  for (const program of programs) {
    const startAt = new Date(program.startAt);
    const key = `${startAt.getFullYear()}-${startAt.getMonth()}-${startAt.getDate()}`;
    const currentGroup = groups[groups.length - 1];

    if (currentGroup?.key === key) {
      currentGroup.items.push(program);
      continue;
    }

    groups.push({
      key,
      label: dayFormatter.format(startAt),
      items: [program],
    });
  }

  return groups;
}

function formatProgramDateTime(value: string | null) {
  if (!value) {
    return "No end time";
  }

  return dateTimeFormatter.format(new Date(value));
}

function formatProgramTimeRange(program: ProgramEntry) {
  const start = new Date(program.startAt);
  const end = program.endAt ? new Date(program.endAt) : null;

  return end ? `${timeFormatter.format(start)} - ${timeFormatter.format(end)}` : `${timeFormatter.format(start)} onward`;
}
