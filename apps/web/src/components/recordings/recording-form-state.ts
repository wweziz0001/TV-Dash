import { recordingJobInputSchema, recordingJobUpdateInputSchema, type RecordingJobInput, type RecordingJobUpdateInput } from "@tv-dash/shared";
import type { RecordingJob, RecordingQualityOption } from "@/types/api";

export interface RecordingFormValue {
  channelId: string;
  title: string;
  mode: "IMMEDIATE" | "TIMED" | "SCHEDULED";
  requestedQualitySelector: string;
  startAtLocal: string;
  endAtLocal: string;
}

export type RecordingFormField = "channelId" | "title" | "requestedQualitySelector" | "startAtLocal" | "endAtLocal" | "general";

export interface RecordingFormIssue {
  field: RecordingFormField;
  message: string;
}

export interface RecordingFormValidationResult {
  isValid: boolean;
  issues: RecordingFormIssue[];
  createPayload: RecordingJobInput | null;
  updatePayload: RecordingJobUpdateInput | null;
}

export const emptyRecordingForm: RecordingFormValue = {
  channelId: "",
  title: "",
  mode: "IMMEDIATE",
  requestedQualitySelector: "AUTO",
  startAtLocal: "",
  endAtLocal: "",
};

export function buildRecordingForm(job: RecordingJob): RecordingFormValue {
  return {
    channelId: job.channelId ?? "",
    title: job.title,
    mode: job.mode === "IMMEDIATE" || job.mode === "TIMED" || job.mode === "SCHEDULED" ? job.mode : "SCHEDULED",
    requestedQualitySelector: job.requestedQualitySelector ?? "AUTO",
    startAtLocal: toDateTimeLocal(job.startAt),
    endAtLocal: toDateTimeLocal(job.endAt),
  };
}

export function createEmptyRecordingForm(defaults?: Partial<RecordingFormValue>) {
  return {
    ...emptyRecordingForm,
    ...defaults,
  };
}

export function toDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function validateRecordingForm(
  form: RecordingFormValue,
  options: {
    mode: "create" | "update";
    now?: Date;
    qualityOptions?: RecordingQualityOption[];
  },
): RecordingFormValidationResult {
  const issues: RecordingFormIssue[] = [];
  const now = options.now ?? new Date();

  if (!form.channelId) {
    issues.push({
      field: "channelId",
      message: "Select a channel before saving the recording.",
    });
  }

  if (options.mode === "create") {
    const payload = buildCreatePayload(form, now, issues, options.qualityOptions ?? []);

    if (!payload || issues.length > 0) {
      return {
        isValid: false,
        issues,
        createPayload: null,
        updatePayload: null,
      };
    }

    return {
      isValid: true,
      issues,
      createPayload: payload,
      updatePayload: null,
    };
  }

  const updatePayload = buildUpdatePayload(form, now, issues, options.qualityOptions ?? []);

  if (!updatePayload || issues.length > 0) {
    return {
      isValid: false,
      issues,
      createPayload: null,
      updatePayload: null,
    };
  }

  return {
    isValid: true,
    issues,
    createPayload: null,
    updatePayload,
  };
}

function buildCreatePayload(
  form: RecordingFormValue,
  now: Date,
  issues: RecordingFormIssue[],
  qualityOptions: RecordingQualityOption[],
) {
  if (form.mode === "IMMEDIATE") {
    const payload = {
      channelId: form.channelId,
      title: normalizeOptionalText(form.title),
      mode: "IMMEDIATE" as const,
      startAt: null,
      endAt: null,
      programEntryId: null,
      requestedQualitySelector: normalizeQualitySelector(form.requestedQualitySelector),
      requestedQualityLabel: resolveQualityLabel(form.requestedQualitySelector, qualityOptions),
    } satisfies RecordingJobInput;

    return parseCreatePayload(payload, issues);
  }

  const startAt = parseLocalDateTime(form.startAtLocal);
  const endAt = parseLocalDateTime(form.endAtLocal);

  if (!form.startAtLocal) {
    issues.push({
      field: "startAtLocal",
      message: "Start time is required.",
    });
  } else if (!startAt) {
    issues.push({
      field: "startAtLocal",
      message: "Enter a valid start date and time.",
    });
  }

  if (!form.endAtLocal) {
    issues.push({
      field: "endAtLocal",
      message: "End time is required.",
    });
  } else if (!endAt) {
    issues.push({
      field: "endAtLocal",
      message: "Enter a valid end date and time.",
    });
  }

  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    issues.push({
      field: "endAtLocal",
      message: "End time must be after start time.",
    });
  }

  if (form.mode === "SCHEDULED" && startAt && startAt.getTime() <= now.getTime()) {
    issues.push({
      field: "startAtLocal",
      message: "Scheduled recordings must start in the future.",
    });
  }

  if (issues.length > 0 || !startAt || !endAt) {
    return null;
  }

  const payload = {
    channelId: form.channelId,
    title: normalizeOptionalText(form.title),
    mode: form.mode,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    programEntryId: null,
    requestedQualitySelector: normalizeQualitySelector(form.requestedQualitySelector),
    requestedQualityLabel: resolveQualityLabel(form.requestedQualitySelector, qualityOptions),
  } satisfies RecordingJobInput;

  return parseCreatePayload(payload, issues);
}

function buildUpdatePayload(
  form: RecordingFormValue,
  now: Date,
  issues: RecordingFormIssue[],
  qualityOptions: RecordingQualityOption[],
) {
  const startAt = parseLocalDateTime(form.startAtLocal);
  const endAt = parseLocalDateTime(form.endAtLocal);

  if (!form.startAtLocal) {
    issues.push({
      field: "startAtLocal",
      message: "Start time is required.",
    });
  } else if (!startAt) {
    issues.push({
      field: "startAtLocal",
      message: "Enter a valid start date and time.",
    });
  }

  if (!form.endAtLocal) {
    issues.push({
      field: "endAtLocal",
      message: "End time is required.",
    });
  } else if (!endAt) {
    issues.push({
      field: "endAtLocal",
      message: "Enter a valid end date and time.",
    });
  }

  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    issues.push({
      field: "endAtLocal",
      message: "End time must be after start time.",
    });
  }

  if (endAt && endAt.getTime() <= now.getTime()) {
    issues.push({
      field: "endAtLocal",
      message: "End time must stay in the future.",
    });
  }

  if (issues.length > 0 || !startAt || !endAt) {
    return null;
  }

  const payload = {
    channelId: form.channelId,
    title: normalizeOptionalText(form.title),
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    requestedQualitySelector: normalizeQualitySelector(form.requestedQualitySelector),
    requestedQualityLabel: resolveQualityLabel(form.requestedQualitySelector, qualityOptions),
  } satisfies RecordingJobUpdateInput;

  const parsed = recordingJobUpdateInputSchema.safeParse(payload);

  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => {
      issues.push({
        field: mapSchemaIssueField(issue.path[0]),
        message: issue.message,
      });
    });

    return null;
  }

  return parsed.data;
}

function parseCreatePayload(payload: RecordingJobInput, issues: RecordingFormIssue[]) {
  const parsed = recordingJobInputSchema.safeParse(payload);

  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => {
      issues.push({
        field: mapSchemaIssueField(issue.path[0]),
        message: issue.message,
      });
    });

    return null;
  }

  return parsed.data;
}

function normalizeOptionalText(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeQualitySelector(value: string) {
  const normalized = value.trim();
  return normalized || "AUTO";
}

function resolveQualityLabel(requestedQualitySelector: string, qualityOptions: RecordingQualityOption[]) {
  const normalized = normalizeQualitySelector(requestedQualitySelector);
  return qualityOptions.find((option) => option.value === normalized)?.label ?? (normalized === "AUTO" ? "Source default" : null);
}

function mapSchemaIssueField(field: unknown): RecordingFormField {
  if (field === "channelId" || field === "title" || field === "requestedQualitySelector") {
    return field;
  }

  if (field === "startAt") {
    return "startAtLocal";
  }

  if (field === "endAt") {
    return "endAtLocal";
  }

  return "general";
}

function parseLocalDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hoursText, minutesText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) {
    return null;
  }

  return date;
}
