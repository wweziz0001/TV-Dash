import type { RecordingRecurrenceType, RecordingRuleInput, RecordingWeekday } from "@tv-dash/shared";
import { recordingRuleInputSchema } from "@tv-dash/shared";
import type { RecordingQualityOption, RecordingRule } from "@/types/api";
import { toDateTimeLocal } from "./recording-form-state";

export interface RecordingRuleFormValue {
  channelId: string;
  titleTemplate: string;
  recurrenceType: RecordingRecurrenceType;
  weekdays: RecordingWeekday[];
  startsAtLocal: string;
  durationMinutes: number;
  requestedQualitySelector: string;
  paddingBeforeMinutes: number;
  paddingAfterMinutes: number;
  originProgramEntryId: string | null;
  matchProgramTitle: string;
  isActive: boolean;
  timeZone: string;
}

export type RecordingRuleFormField =
  | "channelId"
  | "titleTemplate"
  | "weekdays"
  | "startsAtLocal"
  | "durationMinutes"
  | "timeZone"
  | "general";

export interface RecordingRuleFormIssue {
  field: RecordingRuleFormField;
  message: string;
}

export interface RecordingRuleFormValidationResult {
  isValid: boolean;
  issues: RecordingRuleFormIssue[];
  payload: RecordingRuleInput | null;
}

export const emptyRecordingRuleForm: RecordingRuleFormValue = {
  channelId: "",
  titleTemplate: "",
  recurrenceType: "DAILY",
  weekdays: [],
  startsAtLocal: "",
  durationMinutes: 60,
  requestedQualitySelector: "AUTO",
  paddingBeforeMinutes: 0,
  paddingAfterMinutes: 0,
  originProgramEntryId: null,
  matchProgramTitle: "",
  isActive: true,
  timeZone: "UTC",
};

export function createEmptyRecordingRuleForm(defaults?: Partial<RecordingRuleFormValue>) {
  return {
    ...emptyRecordingRuleForm,
    ...defaults,
  };
}

export function buildRecordingRuleForm(rule: RecordingRule): RecordingRuleFormValue {
  return {
    channelId: rule.channelId,
    titleTemplate: rule.titleTemplate,
    recurrenceType: rule.recurrenceType,
    weekdays: rule.weekdays,
    startsAtLocal: toDateTimeLocal(rule.startsAt),
    durationMinutes: rule.durationMinutes,
    requestedQualitySelector: rule.requestedQualitySelector ?? "AUTO",
    paddingBeforeMinutes: rule.paddingBeforeMinutes,
    paddingAfterMinutes: rule.paddingAfterMinutes,
    originProgramEntryId: rule.originProgram?.id ?? null,
    matchProgramTitle: rule.matchProgramTitle ?? "",
    isActive: rule.isActive,
    timeZone: rule.timeZone,
  };
}

export function buildRecordingRuleProgramPrefill(params: {
  channelId: string;
  programId: string;
  programTitle: string;
  startAt: string;
  endAt: string;
  timeZone?: string;
}) {
  return createEmptyRecordingRuleForm({
    channelId: params.channelId,
    titleTemplate: params.programTitle,
    recurrenceType: "WEEKLY",
    startsAtLocal: toDateTimeLocal(params.startAt),
    durationMinutes: resolveDurationMinutes(params.startAt, params.endAt),
    originProgramEntryId: params.programId,
    matchProgramTitle: params.programTitle,
    timeZone: params.timeZone ?? resolveBrowserTimeZone(),
  });
}

export function toggleRecordingRuleWeekday(
  weekdays: RecordingWeekday[],
  weekday: RecordingWeekday,
): RecordingWeekday[] {
  return weekdays.includes(weekday) ? weekdays.filter((value) => value !== weekday) : [...weekdays, weekday];
}

export function validateRecordingRuleForm(
  form: RecordingRuleFormValue,
  options: {
    qualityOptions?: RecordingQualityOption[];
  } = {},
): RecordingRuleFormValidationResult {
  const issues: RecordingRuleFormIssue[] = [];
  const startsAt = parseLocalDateTime(form.startsAtLocal);

  if (!form.channelId) {
    issues.push({
      field: "channelId",
      message: "Select a channel before saving the recurring rule.",
    });
  }

  if (!form.startsAtLocal) {
    issues.push({
      field: "startsAtLocal",
      message: "Start date and time are required.",
    });
  } else if (!startsAt) {
    issues.push({
      field: "startsAtLocal",
      message: "Enter a valid recurring start date and time.",
    });
  }

  if (!Number.isInteger(form.durationMinutes) || form.durationMinutes < 5) {
    issues.push({
      field: "durationMinutes",
      message: "Duration must be at least 5 minutes.",
    });
  }

  if (!form.timeZone.trim()) {
    issues.push({
      field: "timeZone",
      message: "Time zone is required for recurring rules.",
    });
  }

  if (form.recurrenceType === "WEEKDAYS" && form.weekdays.length === 0) {
    issues.push({
      field: "weekdays",
      message: "Choose at least one weekday for a weekday-based rule.",
    });
  }

  if (form.recurrenceType === "WEEKLY" && form.weekdays.length > 1) {
    issues.push({
      field: "weekdays",
      message: "Weekly rules can target only one weekday.",
    });
  }

  if (issues.length > 0 || !startsAt) {
    return {
      isValid: false,
      issues,
      payload: null,
    };
  }

  const payload = {
    channelId: form.channelId,
    titleTemplate: normalizeOptionalText(form.titleTemplate),
    recurrenceType: form.recurrenceType,
    weekdays: form.weekdays,
    startsAt: startsAt.toISOString(),
    durationMinutes: form.durationMinutes,
    timeZone: form.timeZone.trim(),
    originProgramEntryId: form.originProgramEntryId,
    matchProgramTitle: normalizeOptionalText(form.matchProgramTitle),
    paddingBeforeMinutes: form.paddingBeforeMinutes,
    paddingAfterMinutes: form.paddingAfterMinutes,
    requestedQualitySelector: normalizeQualitySelector(form.requestedQualitySelector),
    requestedQualityLabel: resolveQualityLabel(form.requestedQualitySelector, options.qualityOptions ?? []),
    isActive: form.isActive,
  } satisfies RecordingRuleInput;

  const parsed = recordingRuleInputSchema.safeParse(payload);

  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => {
      issues.push({
        field: mapSchemaIssueField(issue.path[0]),
        message: issue.message,
      });
    });

    return {
      isValid: false,
      issues,
      payload: null,
    };
  }

  return {
    isValid: true,
    issues,
    payload: parsed.data,
  };
}

function resolveDurationMinutes(startAt: string, endAt: string) {
  const durationMs = Date.parse(endAt) - Date.parse(startAt);

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 60;
  }

  return Math.max(5, Math.round(durationMs / 60_000));
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

function parseLocalDateTime(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function mapSchemaIssueField(field: unknown): RecordingRuleFormField {
  if (
    field === "channelId" ||
    field === "titleTemplate" ||
    field === "weekdays" ||
    field === "startsAt" ||
    field === "durationMinutes" ||
    field === "timeZone"
  ) {
    return field === "startsAt" ? "startsAtLocal" : field;
  }

  return "general";
}

function resolveBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
