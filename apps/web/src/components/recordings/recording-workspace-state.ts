import type { RecordingJob, RecordingJobStatus } from "@/types/api";

export interface RecordingWorkspaceJobGroups {
  activeJobs: RecordingJob[];
  upcomingJobs: RecordingJob[];
}

export type RecordingActivityTone = "active" | "scheduled" | "success" | "failure";

export interface RecordingActivityEvent {
  id: string;
  jobId: string;
  title: string;
  channelName: string;
  status: RecordingJobStatus;
  mode: RecordingJob["mode"];
  label: string;
  tone: RecordingActivityTone;
  timestamp: string;
  detail: string;
  hasPlayback: boolean;
  isProtected: boolean;
}

export function splitRecordingWorkspaceJobs(jobs: RecordingJob[]): RecordingWorkspaceJobGroups {
  return jobs.reduce<RecordingWorkspaceJobGroups>(
    (groups, job) => {
      if (job.status === "RECORDING") {
        groups.activeJobs.push(job);
      } else if (job.status === "PENDING" || job.status === "SCHEDULED") {
        groups.upcomingJobs.push(job);
      }

      return groups;
    },
    {
      activeJobs: [],
      upcomingJobs: [],
    },
  );
}

export function buildRecordingActivityEvents(jobs: RecordingJob[], limit = 20): RecordingActivityEvent[] {
  return [...jobs]
    .sort((left, right) => {
      return (
        new Date(resolveRecordingActivityTimestamp(right)).getTime() -
        new Date(resolveRecordingActivityTimestamp(left)).getTime()
      );
    })
    .slice(0, limit)
    .map((job) => ({
      id: `${job.id}-${job.status.toLowerCase()}`,
      jobId: job.id,
      title: job.title,
      channelName: job.channelNameSnapshot,
      status: job.status,
      mode: job.mode,
      label: resolveRecordingActivityLabel(job.status),
      tone: resolveRecordingActivityTone(job.status),
      timestamp: resolveRecordingActivityTimestamp(job),
      detail: resolveRecordingActivityDetail(job),
      hasPlayback: Boolean(job.asset),
      isProtected: job.isProtected,
    }));
}

function resolveRecordingActivityTimestamp(job: RecordingJob) {
  switch (job.status) {
    case "RECORDING":
      return job.actualStartAt ?? job.updatedAt ?? job.startAt;
    case "COMPLETED":
      return job.actualEndAt ?? job.asset?.endedAt ?? job.updatedAt ?? job.endAt ?? job.startAt;
    case "FAILED":
      return job.actualEndAt ?? job.updatedAt ?? job.endAt ?? job.startAt;
    case "CANCELED":
      return job.updatedAt ?? job.endAt ?? job.startAt;
    case "PENDING":
    case "SCHEDULED":
    default:
      return job.updatedAt ?? job.createdAt ?? job.startAt;
  }
}

function resolveRecordingActivityLabel(status: RecordingJobStatus) {
  switch (status) {
    case "RECORDING":
      return "Recording started";
    case "COMPLETED":
      return "Recording completed";
    case "FAILED":
      return "Recording failed";
    case "CANCELED":
      return "Recording canceled";
    case "PENDING":
      return "Recording queued";
    case "SCHEDULED":
    default:
      return "Recording scheduled";
  }
}

function resolveRecordingActivityTone(status: RecordingJobStatus): RecordingActivityTone {
  switch (status) {
    case "RECORDING":
      return "active";
    case "COMPLETED":
      return "success";
    case "FAILED":
    case "CANCELED":
      return "failure";
    case "PENDING":
    case "SCHEDULED":
    default:
      return "scheduled";
  }
}

function resolveRecordingActivityDetail(job: RecordingJob) {
  switch (job.status) {
    case "RECORDING":
      return `Live capture on ${job.channelNameSnapshot}`;
    case "COMPLETED":
      return job.asset ? `Saved playable media from ${job.channelNameSnapshot}` : `Finished on ${job.channelNameSnapshot}`;
    case "FAILED":
      return job.failureReason || `Recording failed on ${job.channelNameSnapshot}`;
    case "CANCELED":
      return job.cancellationReason || `Canceled before completion on ${job.channelNameSnapshot}`;
    case "PENDING":
      return `Queued for ${job.channelNameSnapshot}`;
    case "SCHEDULED":
    default:
      return `Scheduled for ${job.channelNameSnapshot}`;
  }
}
