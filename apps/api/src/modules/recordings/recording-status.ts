import type { RecordingJobInput, RecordingMode } from "@tv-dash/shared";
import type { RecordingJobStatus } from "@prisma/client";

const RECORDING_MODE_LABELS: Record<RecordingMode, string> = {
  IMMEDIATE: "Immediate recording",
  TIMED: "Timed recording",
  SCHEDULED: "Scheduled recording",
  EPG_PROGRAM: "Program recording",
  RECURRING_RULE: "Recurring recording",
};

export function resolveInitialRecordingJobStatus(payload: RecordingJobInput, now = new Date()): RecordingJobStatus {
  if (payload.mode === "IMMEDIATE") {
    return "PENDING";
  }

  const startAt = payload.startAt ? new Date(payload.startAt) : null;

  if (startAt && startAt.getTime() > now.getTime()) {
    return "SCHEDULED";
  }

  return "PENDING";
}

export function resolveRecordingJobStartAt(payload: RecordingJobInput, now = new Date()) {
  if (payload.mode === "IMMEDIATE") {
    return payload.startAt ? new Date(payload.startAt) : now;
  }

  return new Date(payload.startAt ?? now.toISOString());
}

export function buildDefaultRecordingTitle(params: {
  channelName: string;
  mode: RecordingMode;
  startAt: Date;
}) {
  const label = RECORDING_MODE_LABELS[params.mode];
  const timestamp = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(params.startAt);

  return `${params.channelName} · ${label} · ${timestamp} UTC`;
}

export function canEditRecordingJob(status: RecordingJobStatus) {
  return status === "PENDING" || status === "SCHEDULED";
}

export function canCancelRecordingJob(status: RecordingJobStatus) {
  return status === "PENDING" || status === "SCHEDULED";
}

export function canStopRecordingJob(status: RecordingJobStatus) {
  return status === "RECORDING";
}

export function isUpcomingRecordingStatus(status: RecordingJobStatus) {
  return status === "PENDING" || status === "SCHEDULED";
}

export function isLibraryRecordingStatus(status: RecordingJobStatus) {
  return status === "RECORDING" || status === "COMPLETED" || status === "FAILED" || status === "CANCELED";
}
