import { programEntryInputSchema, type ProgramEntryInput } from "@tv-dash/shared";
import type { ProgramEntry } from "@/types/api";

export type ManualProgramEntryMode = "single" | "recurring";

export interface ManualProgramRecurrenceValue {
  rangeStartDate: string;
  rangeEndDate: string;
  startTimeLocal: string;
  endTimeLocal: string;
  weekdays: number[];
}

export interface ManualProgramFormValue {
  mode: ManualProgramEntryMode;
  title: string;
  subtitle: string;
  startAtLocal: string;
  endAtLocal: string;
  description: string;
  category: string;
  imageUrl: string;
  recurrence: ManualProgramRecurrenceValue;
}

export type ManualProgramFormField =
  | "title"
  | "subtitle"
  | "startAtLocal"
  | "endAtLocal"
  | "description"
  | "category"
  | "imageUrl"
  | "rangeStartDate"
  | "rangeEndDate"
  | "startTimeLocal"
  | "endTimeLocal"
  | "weekdays"
  | "general";

export interface ManualProgramValidationIssue {
  field: ManualProgramFormField;
  message: string;
}

export interface ManualProgramOverlap {
  program: ProgramEntry;
  payload: ProgramEntryInput;
}

export interface ManualProgramValidationResult {
  isValid: boolean;
  payload: ProgramEntryInput | null;
  generatedPayloads: ProgramEntryInput[];
  issues: ManualProgramValidationIssue[];
  overlappingPrograms: ManualProgramOverlap[];
  durationMinutes: number | null;
}

export const weekdayOptions = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

export const emptyManualProgramForm: ManualProgramFormValue = {
  mode: "single",
  title: "",
  subtitle: "",
  startAtLocal: "",
  endAtLocal: "",
  description: "",
  category: "",
  imageUrl: "",
  recurrence: {
    rangeStartDate: "",
    rangeEndDate: "",
    startTimeLocal: "",
    endTimeLocal: "",
    weekdays: [1, 2, 3, 4, 5],
  },
};

export function createEmptyManualProgramForm() {
  return {
    ...emptyManualProgramForm,
    recurrence: {
      ...emptyManualProgramForm.recurrence,
      weekdays: [...emptyManualProgramForm.recurrence.weekdays],
    },
  };
}

export function buildManualProgramForm(program: ProgramEntry): ManualProgramFormValue {
  const startDate = new Date(program.startAt);
  const endDate = program.endAt ? new Date(program.endAt) : null;

  return {
    mode: "single",
    title: program.title,
    subtitle: program.subtitle ?? "",
    startAtLocal: toDateTimeLocal(program.startAt),
    endAtLocal: toDateTimeLocal(program.endAt),
    description: program.description ?? "",
    category: program.category ?? "",
    imageUrl: program.imageUrl ?? "",
    recurrence: {
      rangeStartDate: toDateInputValue(program.startAt),
      rangeEndDate: toDateInputValue(program.endAt ?? program.startAt),
      startTimeLocal: toTimeInputValue(startDate),
      endTimeLocal: toTimeInputValue(endDate ?? startDate),
      weekdays: [startDate.getDay()],
    },
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

export function hasManualProgramFormChanges(form: ManualProgramFormValue) {
  return (
    form.title.trim().length > 0 ||
    form.subtitle.trim().length > 0 ||
    form.startAtLocal.trim().length > 0 ||
    form.endAtLocal.trim().length > 0 ||
    form.description.trim().length > 0 ||
    form.category.trim().length > 0 ||
    form.imageUrl.trim().length > 0 ||
    form.recurrence.rangeStartDate.trim().length > 0 ||
    form.recurrence.rangeEndDate.trim().length > 0 ||
    form.recurrence.startTimeLocal.trim().length > 0 ||
    form.recurrence.endTimeLocal.trim().length > 0
  );
}

export function getManualProgramStatus(program: ProgramEntry, now = new Date()) {
  const start = new Date(program.startAt).getTime();
  const end = program.endAt ? new Date(program.endAt).getTime() : Number.POSITIVE_INFINITY;
  const current = now.getTime();

  if (!Number.isFinite(start)) {
    return "unknown" as const;
  }

  if (start <= current && current < end) {
    return "live" as const;
  }

  if (start > current) {
    return "upcoming" as const;
  }

  return "ended" as const;
}

export function validateManualProgramForm(params: {
  channelId: string;
  form: ManualProgramFormValue;
  existingPrograms: ProgramEntry[];
  editingProgramId?: string | null;
}) {
  const issues: ManualProgramValidationIssue[] = [];
  const title = params.form.title.trim();

  if (!params.channelId) {
    issues.push({
      field: "general",
      message: "Select a channel before saving a manual programme.",
    });
  }

  if (!title) {
    issues.push({
      field: "title",
      message: "Title is required.",
    });
  }

  const builtPayloads =
    params.form.mode === "single"
      ? buildSinglePayload({
          channelId: params.channelId,
          form: params.form,
          issues,
        })
      : buildRecurringPayloads({
          channelId: params.channelId,
          form: params.form,
          issues,
        });

  if (issues.length > 0 || builtPayloads.length === 0 || !params.channelId) {
    return {
      isValid: false,
      payload: null,
      generatedPayloads: [],
      issues,
      overlappingPrograms: [],
      durationMinutes: getDurationMinutes(params.form),
    } satisfies ManualProgramValidationResult;
  }

  const overlappingPrograms = findOverlappingPrograms(params.existingPrograms, builtPayloads, params.editingProgramId);

  if (overlappingPrograms.length > 0) {
    issues.push({
      field: "general",
      message:
        params.form.mode === "recurring"
          ? "Some generated entries overlap existing manual programmes on this channel."
          : "This time range overlaps another manual programme on the selected channel.",
    });
  }

  return {
    isValid: issues.length === 0 && overlappingPrograms.length === 0,
    payload: builtPayloads[0] ?? null,
    generatedPayloads: builtPayloads,
    issues,
    overlappingPrograms,
    durationMinutes: getDurationMinutes(params.form),
  } satisfies ManualProgramValidationResult;
}

function buildSinglePayload(params: {
  channelId: string;
  form: ManualProgramFormValue;
  issues: ManualProgramValidationIssue[];
}) {
  const startAt = parseLocalDateTime(params.form.startAtLocal);
  const endAt = parseLocalDateTime(params.form.endAtLocal);

  if (!params.form.startAtLocal) {
    params.issues.push({
      field: "startAtLocal",
      message: "Start time is required.",
    });
  } else if (!startAt) {
    params.issues.push({
      field: "startAtLocal",
      message: "Enter a valid start date and time.",
    });
  }

  if (!params.form.endAtLocal) {
    params.issues.push({
      field: "endAtLocal",
      message: "End time is required.",
    });
  } else if (!endAt) {
    params.issues.push({
      field: "endAtLocal",
      message: "Enter a valid end date and time.",
    });
  }

  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    params.issues.push({
      field: "endAtLocal",
      message: "End time must be after start time.",
    });
  }

  if (params.issues.length > 0 || !startAt || !endAt) {
    return [];
  }

  const payload = buildProgramEntryInput({
    channelId: params.channelId,
    title: params.form.title,
    subtitle: params.form.subtitle,
    startAt,
    endAt,
    description: params.form.description,
    category: params.form.category,
    imageUrl: params.form.imageUrl,
    issues: params.issues,
  });

  return payload ? [payload] : [];
}

function buildRecurringPayloads(params: {
  channelId: string;
  form: ManualProgramFormValue;
  issues: ManualProgramValidationIssue[];
}) {
  const rangeStart = parseLocalDate(params.form.recurrence.rangeStartDate);
  const rangeEnd = parseLocalDate(params.form.recurrence.rangeEndDate);
  const startTime = parseTime(params.form.recurrence.startTimeLocal);
  const endTime = parseTime(params.form.recurrence.endTimeLocal);
  const weekdays = [...params.form.recurrence.weekdays].sort((left, right) => left - right);

  if (!params.form.recurrence.rangeStartDate) {
    params.issues.push({
      field: "rangeStartDate",
      message: "Repeat start date is required.",
    });
  } else if (!rangeStart) {
    params.issues.push({
      field: "rangeStartDate",
      message: "Enter a valid repeat start date.",
    });
  }

  if (!params.form.recurrence.rangeEndDate) {
    params.issues.push({
      field: "rangeEndDate",
      message: "Repeat end date is required.",
    });
  } else if (!rangeEnd) {
    params.issues.push({
      field: "rangeEndDate",
      message: "Enter a valid repeat end date.",
    });
  }

  if (!params.form.recurrence.startTimeLocal) {
    params.issues.push({
      field: "startTimeLocal",
      message: "Start time is required.",
    });
  } else if (!startTime) {
    params.issues.push({
      field: "startTimeLocal",
      message: "Enter a valid start time.",
    });
  }

  if (!params.form.recurrence.endTimeLocal) {
    params.issues.push({
      field: "endTimeLocal",
      message: "End time is required.",
    });
  } else if (!endTime) {
    params.issues.push({
      field: "endTimeLocal",
      message: "Enter a valid end time.",
    });
  }

  if (weekdays.length === 0) {
    params.issues.push({
      field: "weekdays",
      message: "Select at least one repeat day.",
    });
  }

  if (rangeStart && rangeEnd && rangeEnd.getTime() < rangeStart.getTime()) {
    params.issues.push({
      field: "rangeEndDate",
      message: "Repeat end date must be on or after the start date.",
    });
  }

  if (startTime && endTime && compareTimes(startTime, endTime) >= 0) {
    params.issues.push({
      field: "endTimeLocal",
      message: "End time must be after start time.",
    });
  }

  if (params.issues.length > 0 || !rangeStart || !rangeEnd || !startTime || !endTime || weekdays.length === 0) {
    return [];
  }

  const payloads: ProgramEntryInput[] = [];
  const current = new Date(rangeStart.getTime());
  let occurrenceCount = 0;

  while (current.getTime() <= rangeEnd.getTime()) {
    if (weekdays.includes(current.getDay())) {
      const startAt = combineDateAndTime(current, startTime);
      const endAt = combineDateAndTime(current, endTime);
      const payload = buildProgramEntryInput({
        channelId: params.channelId,
        title: params.form.title,
        subtitle: params.form.subtitle,
        startAt,
        endAt,
        description: params.form.description,
        category: params.form.category,
        imageUrl: params.form.imageUrl,
        issues: params.issues,
      });

      if (payload) {
        payloads.push(payload);
        occurrenceCount += 1;
      }
    }

    current.setDate(current.getDate() + 1);

    if (occurrenceCount > 366) {
      params.issues.push({
        field: "general",
        message: "Repeat generation is limited to 366 entries per save.",
      });
      return [];
    }
  }

  if (payloads.length === 0) {
    params.issues.push({
      field: "general",
      message: "No entries were generated for the selected date range and repeat days.",
    });
  }

  return payloads;
}

function buildProgramEntryInput(params: {
  channelId: string;
  title: string;
  subtitle: string;
  startAt: Date;
  endAt: Date;
  description: string;
  category: string;
  imageUrl: string;
  issues: ManualProgramValidationIssue[];
}) {
  const payload = {
    channelId: params.channelId,
    title: params.title.trim(),
    subtitle: normalizeOptionalText(params.subtitle),
    startAt: params.startAt.toISOString(),
    endAt: params.endAt.toISOString(),
    description: normalizeOptionalText(params.description),
    category: normalizeOptionalText(params.category),
    imageUrl: normalizeOptionalText(params.imageUrl),
  } satisfies ProgramEntryInput;

  const parsedPayload = programEntryInputSchema.safeParse(payload);

  if (!parsedPayload.success) {
    for (const issue of parsedPayload.error.issues) {
      params.issues.push({
        field: mapSchemaIssueToField(issue.path[0]),
        message: issue.message,
      });
    }

    return null;
  }

  return parsedPayload.data;
}

function parseLocalDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hoursText, minutesText] = match;

  return parseDatePieces({
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hours: Number(hoursText),
    minutes: Number(minutesText),
  });
}

function parseLocalDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;

  return parseDatePieces({
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hours: 0,
    minutes: 0,
  });
}

function parseDatePieces(parts: {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}) {
  const date = new Date(parts.year, parts.month - 1, parts.day, parts.hours, parts.minutes, 0, 0);

  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day ||
    date.getHours() !== parts.hours ||
    date.getMinutes() !== parts.minutes
  ) {
    return null;
  }

  return date;
}

function parseTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, hoursText, minutesText] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

function normalizeOptionalText(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function mapSchemaIssueToField(field: unknown): ManualProgramFormField {
  if (
    field === "title" ||
    field === "subtitle" ||
    field === "startAt" ||
    field === "endAt" ||
    field === "description" ||
    field === "category" ||
    field === "imageUrl"
  ) {
    if (field === "startAt") {
      return "startAtLocal";
    }

    if (field === "endAt") {
      return "endAtLocal";
    }

    return field;
  }

  return "general";
}

function findOverlappingPrograms(programs: ProgramEntry[], payloads: ProgramEntryInput[], editingProgramId?: string | null) {
  const overlaps: ManualProgramOverlap[] = [];

  for (const payload of payloads) {
    const startAt = Date.parse(payload.startAt);
    const endAt = Date.parse(payload.endAt);

    for (const program of programs) {
      if (program.id === editingProgramId) {
        continue;
      }

      const programStartAt = Date.parse(program.startAt);
      const programEndAt = program.endAt ? Date.parse(program.endAt) : Number.POSITIVE_INFINITY;

      if (startAt < programEndAt && programStartAt < endAt) {
        overlaps.push({
          program,
          payload,
        });
      }
    }
  }

  const uniqueOverlapMap = new Map<string, ManualProgramOverlap>();

  for (const overlap of overlaps) {
    uniqueOverlapMap.set(`${overlap.program.id}:${overlap.payload.startAt}`, overlap);
  }

  return [...uniqueOverlapMap.values()];
}

function getDurationMinutes(form: ManualProgramFormValue) {
  if (form.mode === "single") {
    const startAt = parseLocalDateTime(form.startAtLocal);
    const endAt = parseLocalDateTime(form.endAtLocal);

    if (!startAt || !endAt || endAt.getTime() <= startAt.getTime()) {
      return null;
    }

    return Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
  }

  const startTime = parseTime(form.recurrence.startTimeLocal);
  const endTime = parseTime(form.recurrence.endTimeLocal);

  if (!startTime || !endTime || compareTimes(startTime, endTime) >= 0) {
    return null;
  }

  return (endTime.hours * 60 + endTime.minutes) - (startTime.hours * 60 + startTime.minutes);
}

function compareTimes(left: { hours: number; minutes: number }, right: { hours: number; minutes: number }) {
  return left.hours * 60 + left.minutes - (right.hours * 60 + right.minutes);
}

function combineDateAndTime(date: Date, time: { hours: number; minutes: number }) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.hours, time.minutes, 0, 0);
}

function toDateInputValue(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toTimeInputValue(date: Date) {
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${hours}:${minutes}`;
}
