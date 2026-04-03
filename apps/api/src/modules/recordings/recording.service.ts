import type { RecordingJobInput, RecordingJobUpdateInput, UserRole } from "@tv-dash/shared";
import { createRecordingPlaybackToken, readRecordingPlaybackToken } from "./recording-playback-token.js";
import { listRecordingQualityOptions } from "./recording-quality.js";
import { resolveRecordingRunProgress } from "./recording-progress.js";
import {
  cancelRecordingJob,
  createRecordingJob,
  deleteRecordingJob,
  findRecordingJobById,
  findRecordingPlaybackJobById,
  listRecordingJobs,
  updateRecordingJobSchedule,
  type RecordingJobRecord,
} from "./recording.repository.js";
import {
  buildDefaultRecordingTitle,
  canCancelRecordingJob,
  canEditRecordingJob,
  canStopRecordingJob,
  resolveInitialRecordingJobStatus,
  resolveRecordingJobStartAt,
} from "./recording-status.js";
import { deleteRecordingFile } from "./recording-storage.js";
import { getChannelById, getChannelStreamDetails } from "../channels/channel.service.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { pokeRecordingRuntime, stopActiveRecordingJob } from "./recording-runtime.js";

interface RecordingViewer {
  id: string;
  role: UserRole;
  username: string;
}

function canViewAllRecordings(viewer: RecordingViewer) {
  return viewer.role === "ADMIN";
}

function mapFileSize(value: bigint | null | undefined) {
  if (typeof value !== "bigint") {
    return null;
  }

  return Number(value);
}

async function mapRecordingJob(record: RecordingJobRecord) {
  const latestRun = await resolveRecordingRunProgress(record);

  return {
    id: record.id,
    channelId: record.channelId,
    channelNameSnapshot: record.channelNameSnapshot,
    channelSlugSnapshot: record.channelSlugSnapshot,
    title: record.title,
    requestedQualitySelector: record.requestedQualitySelector ?? null,
    requestedQualityLabel: record.requestedQualityLabel ?? null,
    mode: record.mode,
    status: record.status,
    startAt: record.startAt.toISOString(),
    endAt: record.endAt?.toISOString() ?? null,
    actualStartAt: record.actualStartAt?.toISOString() ?? null,
    actualEndAt: record.actualEndAt?.toISOString() ?? null,
    failureReason: record.failureReason,
    cancellationReason: record.cancellationReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    channel: record.channel
      ? {
          id: record.channel.id,
          name: record.channel.name,
          slug: record.channel.slug,
          isActive: record.channel.isActive,
        }
      : null,
    createdByUser: record.createdByUser
      ? {
          id: record.createdByUser.id,
          username: record.createdByUser.username,
          role: record.createdByUser.role,
        }
      : null,
    latestRun,
    asset: record.asset
      ? {
          id: record.asset.id,
          channelId: record.asset.channelId,
          channelNameSnapshot: record.asset.channelNameSnapshot,
          channelSlugSnapshot: record.asset.channelSlugSnapshot,
          title: record.asset.title,
          fileName: record.asset.fileName,
          mimeType: record.asset.mimeType,
          containerFormat: record.asset.containerFormat,
          startedAt: record.asset.startedAt.toISOString(),
          endedAt: record.asset.endedAt.toISOString(),
          durationSeconds: record.asset.durationSeconds,
          fileSizeBytes: mapFileSize(record.asset.fileSizeBytes),
          createdAt: record.asset.createdAt.toISOString(),
          updatedAt: record.asset.updatedAt.toISOString(),
        }
      : null,
  };
}

async function getOwnedRecordingJob(viewer: RecordingViewer, recordingJobId: string) {
  const job = await findRecordingJobById(recordingJobId);

  if (!job) {
    return null;
  }

  if (job.createdByUserId !== viewer.id && !canViewAllRecordings(viewer)) {
    return null;
  }

  return job;
}

async function recordAdminRecordingAudit(params: {
  viewer: RecordingViewer;
  action: string;
  job: RecordingJobRecord;
}) {
  if (params.viewer.role !== "ADMIN") {
    return;
  }

  await recordAuditEvent({
    actorUserId: params.viewer.id,
    actorRole: params.viewer.role,
    action: params.action,
    targetType: "recording-job",
    targetId: params.job.id,
    targetName: params.job.title,
    detail: {
      channelId: params.job.channelId,
      channelSlug: params.job.channelSlugSnapshot,
      mode: params.job.mode,
      status: params.job.status,
    },
  });
}

export async function listRecordingJobsForViewer(
  viewer: RecordingViewer,
  filters: {
    search?: string;
    statuses?: RecordingJobRecord["status"][];
    channelId?: string;
  },
) {
  const jobs = await listRecordingJobs({
    userId: viewer.id,
    includeAllUsers: canViewAllRecordings(viewer),
    search: filters.search,
    statuses: filters.statuses,
    channelId: filters.channelId,
  });

  return Promise.all(jobs.map(mapRecordingJob));
}

export async function getRecordingJobForViewer(viewer: RecordingViewer, recordingJobId: string) {
  const job = await getOwnedRecordingJob(viewer, recordingJobId);

  if (!job) {
    throw new Error("Recording job not found");
  }

  return mapRecordingJob(job);
}

export async function createRecordingJobForViewer(viewer: RecordingViewer, payload: RecordingJobInput) {
  if (payload.mode === "IMMEDIATE" && payload.startAt && Date.parse(payload.startAt) > Date.now()) {
    throw new Error("Immediate recording cannot start in the future");
  }

  const startAt = resolveRecordingJobStartAt(payload);
  const endAt = payload.endAt ? new Date(payload.endAt) : null;

  if (endAt && endAt.getTime() <= Date.now()) {
    throw new Error("Recording end time must be in the future");
  }

  const channel = await getChannelById(payload.channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  const title = payload.title ?? buildDefaultRecordingTitle({
    channelName: channel.name,
    mode: payload.mode,
    startAt,
  });

  const job = await createRecordingJob({
    channelId: channel.id,
    channelNameSnapshot: channel.name,
    channelSlugSnapshot: channel.slug,
    createdByUserId: viewer.id,
    title,
    requestedQualitySelector: payload.requestedQualitySelector,
    requestedQualityLabel: payload.requestedQualityLabel,
    mode: payload.mode,
    status: resolveInitialRecordingJobStatus(payload),
    startAt,
    endAt,
    programEntryId: payload.programEntryId,
  });

  await recordAdminRecordingAudit({
    viewer,
    action: "recording-job.create",
    job,
  });

  pokeRecordingRuntime();
  return mapRecordingJob(job);
}

export async function updateRecordingJobForViewer(
  viewer: RecordingViewer,
  recordingJobId: string,
  payload: RecordingJobUpdateInput,
) {
  const currentJob = await getOwnedRecordingJob(viewer, recordingJobId);

  if (!currentJob) {
    throw new Error("Recording job not found");
  }

  if (!canEditRecordingJob(currentJob.status)) {
    throw new Error("Only pending or scheduled recordings can be edited");
  }

  const startAt = new Date(payload.startAt);
  const endAt = new Date(payload.endAt);

  if (endAt.getTime() <= Date.now()) {
    throw new Error("Recording end time must be in the future");
  }

  const channel = await getChannelById(payload.channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  const updatedJob = await updateRecordingJobSchedule(recordingJobId, {
    channelId: channel.id,
    channelNameSnapshot: channel.name,
    channelSlugSnapshot: channel.slug,
    title: payload.title ?? currentJob.title,
    requestedQualitySelector: payload.requestedQualitySelector,
    requestedQualityLabel: payload.requestedQualityLabel,
    startAt,
    endAt,
    status: startAt.getTime() > Date.now() ? "SCHEDULED" : "PENDING",
  });

  await recordAdminRecordingAudit({
    viewer,
    action: "recording-job.update",
    job: updatedJob,
  });

  pokeRecordingRuntime();
  return mapRecordingJob(updatedJob);
}

export async function cancelRecordingJobForViewer(viewer: RecordingViewer, recordingJobId: string) {
  const currentJob = await getOwnedRecordingJob(viewer, recordingJobId);

  if (!currentJob) {
    throw new Error("Recording job not found");
  }

  if (!canCancelRecordingJob(currentJob.status)) {
    throw new Error("Only pending or scheduled recordings can be canceled");
  }

  const canceledJob = await cancelRecordingJob(recordingJobId, "Canceled before recording started");

  await recordAdminRecordingAudit({
    viewer,
    action: "recording-job.cancel",
    job: canceledJob,
  });

  pokeRecordingRuntime();
  return mapRecordingJob(canceledJob);
}

export async function stopRecordingJobForViewer(viewer: RecordingViewer, recordingJobId: string) {
  const currentJob = await getOwnedRecordingJob(viewer, recordingJobId);

  if (!currentJob) {
    throw new Error("Recording job not found");
  }

  if (!canStopRecordingJob(currentJob.status)) {
    throw new Error("Only actively recording jobs can be stopped");
  }

  await stopActiveRecordingJob(recordingJobId, {
    reason: `Stopped by ${viewer.username}`,
    waitForExit: true,
  });

  const refreshedJob = await getOwnedRecordingJob(viewer, recordingJobId);

  if (!refreshedJob) {
    throw new Error("Recording job not found after stop");
  }

  await recordAdminRecordingAudit({
    viewer,
    action: "recording-job.stop",
    job: refreshedJob,
  });

  return mapRecordingJob(refreshedJob);
}

export async function deleteRecordingJobForViewer(viewer: RecordingViewer, recordingJobId: string) {
  const currentJob = await getOwnedRecordingJob(viewer, recordingJobId);

  if (!currentJob) {
    throw new Error("Recording job not found");
  }

  if (currentJob.status === "RECORDING") {
    throw new Error("Stop the active recording before deleting it");
  }

  const deletedJob = await deleteRecordingJob(recordingJobId);
  const storagePaths = [
    ...new Set(
      [deletedJob.asset?.storagePath, ...deletedJob.runs.map((run) => run.storagePath)].filter(
        (storagePath): storagePath is string => Boolean(storagePath),
      ),
    ),
  ];

  await Promise.all(storagePaths.map((storagePath) => deleteRecordingFile(storagePath)));

  return undefined;
}

export async function getRecordingPlaybackAccessForViewer(viewer: RecordingViewer, recordingJobId: string) {
  const playbackJob = await findRecordingPlaybackJobById(recordingJobId);

  if (!playbackJob || (!canViewAllRecordings(viewer) && playbackJob.createdByUserId !== viewer.id)) {
    throw new Error("Recording job not found");
  }

  if (!playbackJob.asset) {
    throw new Error("Recording media is not available");
  }

  const token = createRecordingPlaybackToken({
    recordingJobId,
    recordingAssetId: playbackJob.asset.id,
  });

  return {
    playbackUrl: `/api/recordings/${recordingJobId}/media?token=${encodeURIComponent(token)}`,
  };
}

export async function getRecordingQualityOptionsForViewer(_viewer: RecordingViewer, channelId: string) {
  const channel = await getChannelStreamDetails(channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  return listRecordingQualityOptions(channel);
}

export async function getRecordingMediaByPlaybackToken(recordingJobId: string, token: string) {
  const payload = readRecordingPlaybackToken(token, recordingJobId);

  if (!payload) {
    return null;
  }

  const playbackJob = await findRecordingPlaybackJobById(recordingJobId);

  if (!playbackJob?.asset || playbackJob.asset.id !== payload.recordingAssetId) {
    return null;
  }

  return playbackJob.asset;
}
