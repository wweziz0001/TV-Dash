import type { RecordingJobStatus } from "@prisma/client";
import { env } from "../../config/env.js";

export interface RecordingRetentionPolicy {
  maxAgeDays: number;
  maxRecordingsPerChannel: number;
  failedCleanupHours: number;
}

export type RecordingRetentionDeleteReason = "AGE_LIMIT" | "CHANNEL_LIMIT" | "FAILED_CLEANUP";

export interface RecordingRetentionCandidate {
  id: string;
  channelId: string | null;
  status: RecordingJobStatus;
  isProtected: boolean;
  startAt: Date;
  actualEndAt: Date | null;
  createdAt: Date;
  asset: {
    endedAt: Date;
  } | null;
}

export interface RecordingRetentionDecision {
  jobId: string;
  deleteReason: RecordingRetentionDeleteReason;
}

export function getRecordingRetentionPolicy(): RecordingRetentionPolicy {
  return {
    maxAgeDays: env.RECORDINGS_RETENTION_DAYS,
    maxRecordingsPerChannel: env.RECORDINGS_RETENTION_MAX_PER_CHANNEL,
    failedCleanupHours: env.RECORDINGS_FAILED_CLEANUP_HOURS,
  };
}

export function resolveRecordingRetentionReferenceDate(job: RecordingRetentionCandidate) {
  return job.asset?.endedAt ?? job.actualEndAt ?? job.startAt ?? job.createdAt;
}

function hasExpired(referenceDate: Date, maxAgeMs: number, now: Date) {
  return now.getTime() >= referenceDate.getTime() + maxAgeMs;
}

export function evaluateRecordingRetention(
  jobs: RecordingRetentionCandidate[],
  now = new Date(),
  policy = getRecordingRetentionPolicy(),
) {
  const decisions: RecordingRetentionDecision[] = [];
  const completedByChannel = new Map<string, RecordingRetentionCandidate[]>();
  const completedMaxAgeMs = policy.maxAgeDays * 24 * 60 * 60_000;
  const failedCleanupMs = policy.failedCleanupHours * 60 * 60_000;

  for (const job of jobs) {
    if (job.isProtected) {
      continue;
    }

    const referenceDate = resolveRecordingRetentionReferenceDate(job);

    if ((job.status === "FAILED" || job.status === "CANCELED") && hasExpired(referenceDate, failedCleanupMs, now)) {
      decisions.push({
        jobId: job.id,
        deleteReason: "FAILED_CLEANUP",
      });
      continue;
    }

    if (job.status !== "COMPLETED") {
      continue;
    }

    if (hasExpired(referenceDate, completedMaxAgeMs, now)) {
      decisions.push({
        jobId: job.id,
        deleteReason: "AGE_LIMIT",
      });
      continue;
    }

    if (!job.channelId) {
      continue;
    }

    const channelJobs = completedByChannel.get(job.channelId);

    if (channelJobs) {
      channelJobs.push(job);
      continue;
    }

    completedByChannel.set(job.channelId, [job]);
  }

  for (const channelJobs of completedByChannel.values()) {
    if (channelJobs.length <= policy.maxRecordingsPerChannel) {
      continue;
    }

    channelJobs
      .sort(
        (left, right) =>
          resolveRecordingRetentionReferenceDate(right).getTime() - resolveRecordingRetentionReferenceDate(left).getTime(),
      )
      .slice(policy.maxRecordingsPerChannel)
      .forEach((job) => {
        decisions.push({
          jobId: job.id,
          deleteReason: "CHANNEL_LIMIT",
        });
      });
  }

  return decisions;
}
