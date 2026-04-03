import type { RecordingRecurrenceType, RecordingWeekday } from "@tv-dash/shared";

const MINUTES_PER_DAY = 24 * 60;
const DAY_START_HOUR = 12;
const WEEKDAY_BY_JS_DAY: RecordingWeekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export interface RecordingRuleSchedule {
  recurrenceType: RecordingRecurrenceType;
  weekdays: RecordingWeekday[];
  startsAt: Date;
  durationMinutes: number;
  timeZone: string;
  paddingBeforeMinutes: number;
  paddingAfterMinutes: number;
}

export interface RecordingRuleOccurrence {
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  startAt: Date;
  endAt: Date;
  weekday: RecordingWeekday;
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

interface LocalDateTimeParts extends LocalDateParts {
  hour: number;
  minute: number;
}

function getFormatter(timeZone: string, withTime = false) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      : {}),
  });
}

function parseLocalParts(date: Date, timeZone: string, withTime = false): LocalDateTimeParts {
  const formatter = getFormatter(timeZone, withTime);
  const parts = formatter.formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
  };
}

function toUtcFromLocalDateTime(localDateTime: LocalDateTimeParts, timeZone: string) {
  let guess = new Date(
    Date.UTC(localDateTime.year, localDateTime.month - 1, localDateTime.day, localDateTime.hour, localDateTime.minute),
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const zoned = parseLocalParts(guess, timeZone, true);
    const desired = Date.UTC(
      localDateTime.year,
      localDateTime.month - 1,
      localDateTime.day,
      localDateTime.hour,
      localDateTime.minute,
    );
    const actual = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute);
    const differenceMs = desired - actual;

    if (differenceMs === 0) {
      return guess;
    }

    guess = new Date(guess.getTime() + differenceMs);
  }

  return guess;
}

function addDays(localDate: LocalDateParts, days: number): LocalDateParts {
  const date = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day + days, DAY_START_HOUR));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function compareLocalDates(left: LocalDateParts, right: LocalDateParts) {
  if (left.year !== right.year) {
    return left.year - right.year;
  }

  if (left.month !== right.month) {
    return left.month - right.month;
  }

  return left.day - right.day;
}

function getWeekdayForLocalDate(localDate: LocalDateParts): RecordingWeekday {
  return WEEKDAY_BY_JS_DAY[new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day, DAY_START_HOUR)).getUTCDay()];
}

function resolveRuleWeekdays(rule: RecordingRuleSchedule): RecordingWeekday[] {
  if (rule.recurrenceType === "DAILY") {
    return [];
  }

  if (rule.recurrenceType === "WEEKLY") {
    if (rule.weekdays.length > 0) {
      return [rule.weekdays[0]];
    }

    return [getWeekdayForDate(rule.startsAt, rule.timeZone)];
  }

  return Array.from(new Set(rule.weekdays));
}

function dateMatchesRule(rule: RecordingRuleSchedule, localDate: LocalDateParts) {
  if (rule.recurrenceType === "DAILY") {
    return true;
  }

  const weekday = getWeekdayForLocalDate(localDate);
  const weekdays = resolveRuleWeekdays(rule);

  return weekdays.includes(weekday);
}

function getStartTimeParts(rule: RecordingRuleSchedule) {
  const startInZone = parseLocalParts(rule.startsAt, rule.timeZone, true);

  return {
    hour: startInZone.hour,
    minute: startInZone.minute,
  };
}

export function getWeekdayForDate(date: Date, timeZone: string): RecordingWeekday {
  const localDate = parseLocalParts(date, timeZone);
  return getWeekdayForLocalDate(localDate);
}

export function buildRecordingRuleOccurrence(
  rule: RecordingRuleSchedule,
  localDate: LocalDateParts,
): RecordingRuleOccurrence {
  const startTime = getStartTimeParts(rule);
  const scheduledStartAt = toUtcFromLocalDateTime(
    {
      ...localDate,
      hour: startTime.hour,
      minute: startTime.minute,
    },
    rule.timeZone,
  );
  const scheduledEndAt = new Date(scheduledStartAt.getTime() + rule.durationMinutes * 60_000);

  return {
    scheduledStartAt,
    scheduledEndAt,
    startAt: new Date(scheduledStartAt.getTime() - rule.paddingBeforeMinutes * 60_000),
    endAt: new Date(scheduledEndAt.getTime() + rule.paddingAfterMinutes * 60_000),
    weekday: getWeekdayForLocalDate(localDate),
  };
}

export function listRecordingRuleOccurrences(
  rule: RecordingRuleSchedule,
  params: {
    rangeStart: Date;
    rangeEnd: Date;
    limit?: number;
  },
) {
  const occurrences: RecordingRuleOccurrence[] = [];
  const scanStartLocalDate = addDays(parseLocalParts(params.rangeStart, rule.timeZone), -1);
  const scanEndLocalDate = addDays(parseLocalParts(params.rangeEnd, rule.timeZone), 1);
  const anchorLocalDate = parseLocalParts(rule.startsAt, rule.timeZone);
  const limit = params.limit ?? 64;

  for (
    let currentLocalDate = compareLocalDates(scanStartLocalDate, anchorLocalDate) < 0 ? anchorLocalDate : scanStartLocalDate;
    compareLocalDates(currentLocalDate, scanEndLocalDate) <= 0;
    currentLocalDate = addDays(currentLocalDate, 1)
  ) {
    if (!dateMatchesRule(rule, currentLocalDate)) {
      continue;
    }

    const occurrence = buildRecordingRuleOccurrence(rule, currentLocalDate);

    if (occurrence.scheduledStartAt.getTime() < rule.startsAt.getTime()) {
      continue;
    }

    if (occurrence.startAt >= params.rangeEnd || occurrence.endAt <= params.rangeStart) {
      continue;
    }

    occurrences.push(occurrence);

    if (occurrences.length >= limit) {
      break;
    }
  }

  return occurrences;
}

export function describeRecordingRuleStart(rule: RecordingRuleSchedule) {
  const parts = getStartTimeParts(rule);
  const hours = `${parts.hour}`.padStart(2, "0");
  const minutes = `${parts.minute}`.padStart(2, "0");

  return `${hours}:${minutes}`;
}

export function validateRecordingRuleDuration(durationMinutes: number) {
  return durationMinutes > 0 && durationMinutes <= MINUTES_PER_DAY;
}
