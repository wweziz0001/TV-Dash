import type { RecordingJobStatus, RecordingMode } from "@tv-dash/shared";
import type { RecordingJob } from "@/types/api";

export type RecordingLibraryStatusFilter = "ALL" | RecordingJobStatus;
export type RecordingLibraryModeFilter = "ALL" | RecordingMode;
export type RecordingLibraryProtectionFilter = "ALL" | "PROTECTED" | "UNPROTECTED";
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
  recordedFrom: string;
  recordedTo: string;
  sort: RecordingLibrarySortOption;
}

export interface RecordingLibrarySummary {
  total: number;
  completed: number;
  failed: number;
  protectedCount: number;
}

export const DEFAULT_LIBRARY_STATUSES: RecordingJobStatus[] = ["COMPLETED"];

export function createDefaultRecordingLibraryFilters(): RecordingLibraryFilters {
  return {
    search: "",
    status: "COMPLETED",
    channelId: "",
    mode: "ALL",
    protection: "ALL",
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
    }),
    {
      total: 0,
      completed: 0,
      failed: 0,
      protectedCount: 0,
    },
  );
}
