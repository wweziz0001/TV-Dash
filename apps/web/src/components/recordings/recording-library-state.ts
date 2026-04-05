import type { RecordingJobStatus, RecordingMode } from "@tv-dash/shared";
import type { RecordingJob } from "@/types/api";

export type RecordingLibraryStatusFilter = "ALL" | RecordingJobStatus;
export type RecordingLibraryModeFilter = "ALL" | RecordingMode;
export type RecordingLibraryProtectionFilter = "ALL" | "PROTECTED" | "UNPROTECTED";
export type RecordingLibraryArchiveFilter = "ALL" | "PROGRAM_LINKED" | "CATCHUP_AVAILABLE" | "RECORDING_ONLY";
export type RecordingLibrarySortOption =
  | "RECORDED_DESC"
  | "RECORDED_ASC"
  | "TITLE_ASC"
  | "TITLE_DESC"
  | "CHANNEL_ASC"
  | "CHANNEL_DESC"
  | "STATUS_ASC"
  | "STATUS_DESC";

export interface RecordingLibraryFilters {
  search: string;
  status: RecordingLibraryStatusFilter;
  channelId: string;
  mode: RecordingLibraryModeFilter;
  protection: RecordingLibraryProtectionFilter;
  archiveAvailability: RecordingLibraryArchiveFilter;
  recordedFrom: string;
  recordedTo: string;
  sort: RecordingLibrarySortOption;
}

export interface RecordingLibrarySummary {
  total: number;
  completed: number;
  failed: number;
  protectedCount: number;
  catchupAvailableCount: number;
  programLinkedCount: number;
}

export interface RecordingLibrarySection {
  id: string;
  label: string;
  jobs: RecordingJob[];
}

export const DEFAULT_LIBRARY_STATUSES: RecordingJobStatus[] = ["COMPLETED"];

export function createDefaultRecordingLibraryFilters(): RecordingLibraryFilters {
  return {
    search: "",
    status: "COMPLETED",
    channelId: "",
    mode: "ALL",
    protection: "ALL",
    archiveAvailability: "ALL",
    recordedFrom: "",
    recordedTo: "",
    sort: "RECORDED_DESC",
  };
}

function parseDateInput(value: string, endOfDay: boolean) {
  if (!value) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function buildRecordingLibraryQueryParams(filters: RecordingLibraryFilters) {
  const params = new URLSearchParams({
    status: (filters.status === "ALL" ? DEFAULT_LIBRARY_STATUSES : [filters.status]).join(","),
    sort: filters.sort,
  });

  if (filters.search.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.channelId) {
    params.set("channelId", filters.channelId);
  }

  if (filters.mode !== "ALL") {
    params.set("mode", filters.mode);
  }

  if (filters.protection === "PROTECTED") {
    params.set("isProtected", "true");
  }

  if (filters.protection === "UNPROTECTED") {
    params.set("isProtected", "false");
  }

  const recordedFrom = parseDateInput(filters.recordedFrom, false);
  const recordedTo = parseDateInput(filters.recordedTo, true);

  if (recordedFrom) {
    params.set("recordedAfter", recordedFrom.toISOString());
  }

  if (recordedTo) {
    params.set("recordedBefore", recordedTo.toISOString());
  }

  return params;
}

export function buildRecordingLibrarySummary(jobs: RecordingJob[]): RecordingLibrarySummary {
  return jobs.reduce<RecordingLibrarySummary>(
    (summary, job) => ({
      total: summary.total + 1,
      completed: summary.completed + (job.status === "COMPLETED" ? 1 : 0),
      failed: summary.failed + (job.status === "FAILED" ? 1 : 0),
      protectedCount: summary.protectedCount + (job.isProtected ? 1 : 0),
      catchupAvailableCount: summary.catchupAvailableCount + (job.archiveContext?.catchup.hasTimeshiftSource ? 1 : 0),
      programLinkedCount: summary.programLinkedCount + (job.archiveContext?.hasProgramLink ? 1 : 0),
    }),
    {
      total: 0,
      completed: 0,
      failed: 0,
      protectedCount: 0,
      catchupAvailableCount: 0,
      programLinkedCount: 0,
    },
  );
}

function getRecordingArchiveDateKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getRecordingArchiveDateLabel(dateKey: string, now: Date) {
  const todayKey = getRecordingArchiveDateKey(now.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getRecordingArchiveDateKey(yesterday.toISOString());

  if (dateKey === todayKey) {
    return "Today";
  }

  if (dateKey === yesterdayKey) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function getRecordingArchiveStartAt(job: RecordingJob) {
  return job.archiveContext?.startAt ?? job.program?.startAt ?? job.actualStartAt ?? job.startAt;
}

export function filterRecordingLibraryJobs(jobs: RecordingJob[], archiveAvailability: RecordingLibraryArchiveFilter) {
  switch (archiveAvailability) {
    case "PROGRAM_LINKED":
      return jobs.filter((job) => job.archiveContext?.hasProgramLink);
    case "CATCHUP_AVAILABLE":
      return jobs.filter((job) => job.archiveContext?.catchup.hasTimeshiftSource);
    case "RECORDING_ONLY":
      return jobs.filter((job) => job.archiveContext?.catchup.archiveStatus === "AIRED_RECORDED");
    case "ALL":
    default:
      return jobs;
  }
}

export function buildRecordingLibrarySections(jobs: RecordingJob[], now = new Date()): RecordingLibrarySection[] {
  const sections = new Map<string, RecordingJob[]>();

  for (const job of jobs) {
    const dateKey = getRecordingArchiveDateKey(getRecordingArchiveStartAt(job));
    const list = sections.get(dateKey);

    if (list) {
      list.push(job);
      continue;
    }

    sections.set(dateKey, [job]);
  }

  return Array.from(sections.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([id, sectionJobs]) => ({
      id,
      label: getRecordingArchiveDateLabel(id, now),
      jobs: sectionJobs.sort(
        (left, right) => Date.parse(getRecordingArchiveStartAt(right)) - Date.parse(getRecordingArchiveStartAt(left)),
      ),
    }));
}

export function buildRecordingArchiveHref(job: RecordingJob) {
  const channelSlug = job.channel?.slug ?? job.channelSlugSnapshot;

  if (!channelSlug) {
    return null;
  }

  const params = new URLSearchParams();
  const archiveStartAt = getRecordingArchiveStartAt(job);

  if (archiveStartAt) {
    params.set("archiveDate", getRecordingArchiveDateKey(archiveStartAt));
  }

  if (job.archiveContext?.programId) {
    params.set("programId", job.archiveContext.programId);
  }

  const query = params.toString();

  return query ? `/watch/${channelSlug}?${query}` : `/watch/${channelSlug}`;
}
