import type {
  RecordingJobInput,
  RecordingJobUpdateInput,
  RecordingRetentionInput,
  RecordingRuleInput,
  RecordingWeekday,
  UserRole,
} from "@tv-dash/shared";
import { getProgramEntryById } from "../epg/epg.service.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { getChannelById, getChannelStreamDetails } from "../channels/channel.service.js";
import { createRecordingPlaybackToken, readRecordingPlaybackToken } from "./recording-playback-token.js";
import { listRecordingQualityOptions } from "./recording-quality.js";
import { resolveRecordingRunProgress } from "./recording-progress.js";
import { getWeekdayForDate } from "./recording-recurrence.js";
import {
  cancelRecordingJob,
  createRecordingJob,
  createRecordingRule,
  deleteRecordingJob,
  deleteRecordingRule,
  deleteUpcomingGeneratedJobsForRule,
  findRecordingJobById,
  findRecordingPlaybackJobById,
  findRecordingRuleById,
  listRecordingCatchupCandidates,
  listRecordingJobs,
  type RecordingJobListSort,
  listRecordingJobsForRulesInWindow,
  listRecordingRules,
  updateRecordingAssetThumbnail,
  updateRecordingJobRetention,
  updateRecordingJobSchedule,
  updateRecordingRule,
  type RecordingJobRecord,
  type RecordingRuleRecord,
} from "./recording.repository.js";
import { getRecordingRetentionPolicy, resolveRecordingRetentionReferenceDate } from "./recording-retention.js";
import { syncRecurringRecordingJobs } from "./recording-rule-sync.js";
import {
  buildDefaultRecordingTitle,
  canCancelRecordingJob,
  canEditRecordingJob,
  canStopRecordingJob,
  resolveInitialRecordingJobStatus,
  resolveRecordingJobStartAt,
} from "./recording-status.js";
import { deleteRecordingFile } from "./recording-storage.js";
import { generateRecordingThumbnail } from "./recording-thumbnail.js";
import { pokeRecordingRuntime, stopActiveRecordingJob } from "./recording-runtime.js";

interface RecordingViewer {
  id: string;
  role: UserRole;
  username: string;
}

interface RecordingRuleViewerFilters {
  channelId?: string;
  isActive?: boolean;
}

interface RecordingJobViewerFilters {
  search?: string;
  statuses?: RecordingJobRecord["status"][];
  channelId?: string;
  modes?: RecordingJobRecord["mode"][];
  isProtected?: boolean;
  recordedAfter?: Date;
  recordedBefore?: Date;
  sort?: RecordingJobListSort;
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

function buildRecordingAssetAccess(recordingJobId: string, recordingAssetId: string) {
  const token = createRecordingPlaybackToken({
    recordingJobId,
    recordingAssetId,
  });
  const encodedToken = encodeURIComponent(token);

  return {
    playbackUrl: `/api/recordings/${recordingJobId}/media?token=${encodedToken}`,
    thumbnailUrl: `/api/recordings/${recordingJobId}/thumbnail?token=${encodedToken}`,
  };
}

function mapRecordingRetention(record: RecordingJobRecord) {
  const policy = getRecordingRetentionPolicy();
  const referenceDate = resolveRecordingRetentionReferenceDate({
    id: record.id,
    channelId: record.channelId,
    status: record.status,
    isProtected: record.isProtected,
    startAt: record.startAt,
    actualEndAt: record.actualEndAt,
    createdAt: record.createdAt,
    asset: record.asset
      ? {
          endedAt: record.asset.endedAt,
        }
      : null,
  });

  if (record.isProtected) {
    return {
      isProtected: true,
      protectedAt: record.protectedAt?.toISOString() ?? null,
      deleteAfter: null,
      mode: "PROTECTED" as const,
      maxAgeDays: policy.maxAgeDays,
      maxRecordingsPerChannel: policy.maxRecordingsPerChannel,
      failedCleanupHours: policy.failedCleanupHours,
    };
  }

  if (record.status === "FAILED" || record.status === "CANCELED") {
    return {
      isProtected: false,
      protectedAt: null,
      deleteAfter: new Date(referenceDate.getTime() + policy.failedCleanupHours * 60 * 60_000).toISOString(),
      mode: "FAILED_CLEANUP" as const,
      maxAgeDays: policy.maxAgeDays,
      maxRecordingsPerChannel: policy.maxRecordingsPerChannel,
      failedCleanupHours: policy.failedCleanupHours,
    };
  }

  if (record.status === "COMPLETED") {
    return {
      isProtected: false,
      protectedAt: null,
      deleteAfter: new Date(referenceDate.getTime() + policy.maxAgeDays * 24 * 60 * 60_000).toISOString(),
      mode: "STANDARD" as const,
      maxAgeDays: policy.maxAgeDays,
      maxRecordingsPerChannel: policy.maxRecordingsPerChannel,
      failedCleanupHours: policy.failedCleanupHours,
    };
  }

  return {
    isProtected: false,
    protectedAt: null,
    deleteAfter: null,
    mode: "ACTIVE" as const,
    maxAgeDays: policy.maxAgeDays,
    maxRecordingsPerChannel: policy.maxRecordingsPerChannel,
    failedCleanupHours: policy.failedCleanupHours,
  };
}

function buildDefaultRecordingRuleTitle(params: {
  channelName: string;
  recurrenceType: RecordingRuleInput["recurrenceType"];
  programmeTitle: string | null;
}) {
  if (params.programmeTitle) {
    return params.programmeTitle;
  }

  const label =
    params.recurrenceType === "DAILY"
      ? "Daily recording"
      : params.recurrenceType === "WEEKLY"
        ? "Weekly recording"
        : "Weekday recording";

  return `${params.channelName} · ${label}`;
}

function normalizeWeekdays(input: RecordingRuleInput) {
  if (input.recurrenceType === "DAILY") {
    return [] as RecordingWeekday[];
  }

  if (input.recurrenceType === "WEEKLY") {
    return [input.weekdays[0] ?? getWeekdayForDate(new Date(input.startsAt), input.timeZone)];
  }

  return Array.from(new Set(input.weekdays));
}

async function resolveProgramEntryContext(payload: RecordingJobInput) {
  if (payload.mode !== "EPG_PROGRAM" || !payload.programEntryId) {
    return null;
  }

  const programme = await getProgramEntryById(payload.programEntryId);

  if (!programme) {
    throw new Error("Guide program not found");
  }

  if (programme.channelId && programme.channelId !== payload.channelId) {
    throw new Error("Guide program does not belong to the selected channel");
  }

  if (!programme.endAt) {
    throw new Error("Guide program must have an end time before it can be recorded");
  }

  return {
    programEntryId: programme.id,
    programTitleSnapshot: programme.title,
    programDescriptionSnapshot: programme.description ?? null,
    programCategorySnapshot: programme.category ?? null,
    programStartAt: new Date(programme.startAt),
    programEndAt: new Date(programme.endAt),
    derivedStartAt: new Date(Date.parse(programme.startAt) - payload.paddingBeforeMinutes * 60_000),
    derivedEndAt: new Date(Date.parse(programme.endAt) + payload.paddingAfterMinutes * 60_000),
    defaultTitle: programme.title,
  };
}

async function resolveRuleOriginProgram(input: RecordingRuleInput) {
  if (!input.originProgramEntryId) {
    return null;
  }

  const programme = await getProgramEntryById(input.originProgramEntryId);

  if (!programme) {
    throw new Error("Guide program not found");
  }

  return {
    id: programme.id,
    title: programme.title,
    startAt: new Date(programme.startAt),
    endAt: programme.endAt ? new Date(programme.endAt) : null,
  };
}

function mapRecordingRuleJobSummary(job: RecordingJobRecord | null) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    title: job.title,
    mode: job.mode,
    status: job.status,
    startAt: job.startAt.toISOString(),
    endAt: job.endAt?.toISOString() ?? null,
    programTitleSnapshot: job.programTitleSnapshot ?? null,
  };
}

async function mapRecordingJob(record: RecordingJobRecord) {
  const latestRun = await resolveRecordingRunProgress(record);
  const assetAccess = record.asset ? buildRecordingAssetAccess(record.id, record.asset.id) : null;

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
    paddingBeforeMinutes: record.paddingBeforeMinutes,
    paddingAfterMinutes: record.paddingAfterMinutes,
    isProtected: record.isProtected,
    protectedAt: record.protectedAt?.toISOString() ?? null,
    startAt: record.startAt.toISOString(),
    endAt: record.endAt?.toISOString() ?? null,
    actualStartAt: record.actualStartAt?.toISOString() ?? null,
    actualEndAt: record.actualEndAt?.toISOString() ?? null,
    failureReason: record.failureReason,
    cancellationReason: record.cancellationReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    retention: mapRecordingRetention(record),
    program: record.programEntryId || record.programTitleSnapshot
      ? {
          id: record.programEntry?.id ?? record.programEntryId,
          sourceKind: record.programEntry?.sourceKind ?? null,
          title: record.programEntry?.title ?? record.programTitleSnapshot ?? null,
          description: record.programEntry?.description ?? record.programDescriptionSnapshot ?? null,
          category: record.programEntry?.category ?? record.programCategorySnapshot ?? null,
          imageUrl: record.programEntry?.imageUrl ?? null,
          startAt: record.programEntry?.startAt.toISOString() ?? record.programStartAt?.toISOString() ?? null,
          endAt: record.programEntry?.endAt?.toISOString() ?? record.programEndAt?.toISOString() ?? null,
        }
      : null,
    recordingRule: record.recordingRuleId || record.recordingRuleNameSnapshot
      ? {
          id: record.recordingRule?.id ?? record.recordingRuleId,
          titleTemplate: record.recordingRule?.titleTemplate ?? record.recordingRuleNameSnapshot ?? null,
          recurrenceType: record.recordingRule?.recurrenceType ?? null,
          weekdays: record.recordingRule?.weekdays ?? [],
          timeZone: record.recordingRule?.timeZone ?? null,
          isActive: record.recordingRule?.isActive ?? null,
        }
      : null,
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
          storagePath: record.asset.storagePath,
          startedAt: record.asset.startedAt.toISOString(),
          endedAt: record.asset.endedAt.toISOString(),
          durationSeconds: record.asset.durationSeconds,
          fileSizeBytes: mapFileSize(record.asset.fileSizeBytes),
          thumbnailUrl: assetAccess?.thumbnailUrl ?? null,
          thumbnailMimeType: record.asset.thumbnailMimeType ?? null,
          thumbnailGeneratedAt: record.asset.thumbnailGeneratedAt?.toISOString() ?? null,
          playbackUrl: assetAccess?.playbackUrl ?? null,
          createdAt: record.asset.createdAt.toISOString(),
          updatedAt: record.asset.updatedAt.toISOString(),
        }
      : null,
  };
}

function mapRecordingRule(record: RecordingRuleRecord, jobs: RecordingJobRecord[]) {
  const sortedJobs = [...jobs].sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
  const nextUpcomingJob =
    sortedJobs.find((job) => job.status === "RECORDING" || job.status === "PENDING" || job.status === "SCHEDULED") ?? null;

  return {
    id: record.id,
    channelId: record.channelId,
    titleTemplate: record.titleTemplate,
    recurrenceType: record.recurrenceType,
    weekdays: record.weekdays,
    startsAt: record.startsAt.toISOString(),
    durationMinutes: record.durationMinutes,
    timeZone: record.timeZone,
    paddingBeforeMinutes: record.paddingBeforeMinutes,
    paddingAfterMinutes: record.paddingAfterMinutes,
    requestedQualitySelector: record.requestedQualitySelector ?? null,
    requestedQualityLabel: record.requestedQualityLabel ?? null,
    matchProgramTitle: record.matchProgramTitle ?? null,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    originProgram: record.originProgramEntryId || record.originProgramTitleSnapshot
      ? {
          id: record.originProgramEntry?.id ?? record.originProgramEntryId,
          sourceKind: record.originProgramEntry?.sourceKind ?? null,
          title: record.originProgramEntry?.title ?? record.originProgramTitleSnapshot ?? null,
          startAt:
            record.originProgramEntry?.startAt.toISOString() ?? record.originProgramStartAt?.toISOString() ?? null,
          endAt: record.originProgramEntry?.endAt?.toISOString() ?? record.originProgramEndAt?.toISOString() ?? null,
        }
      : null,
    channel: {
      id: record.channel.id,
      name: record.channel.name,
      slug: record.channel.slug,
      isActive: record.channel.isActive,
    },
    createdByUser: {
      id: record.createdByUser.id,
      username: record.createdByUser.username,
      role: record.createdByUser.role,
    },
    nextUpcomingJob: mapRecordingRuleJobSummary(nextUpcomingJob),
    generatedJobCount: sortedJobs.length,
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

async function getOwnedRecordingRule(viewer: RecordingViewer, recordingRuleId: string) {
  const rule = await findRecordingRuleById(recordingRuleId);

  if (!rule) {
    return null;
  }

  if (rule.createdByUserId !== viewer.id && !canViewAllRecordings(viewer)) {
    return null;
  }

  return rule;
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
      isProtected: params.job.isProtected,
      recordingRuleId: params.job.recordingRuleId,
      programEntryId: params.job.programEntryId,
    },
  });
}

async function recordAdminRecordingRuleAudit(params: {
  viewer: RecordingViewer;
  action: string;
  rule: RecordingRuleRecord;
}) {
  if (params.viewer.role !== "ADMIN") {
    return;
  }

  await recordAuditEvent({
    actorUserId: params.viewer.id,
    actorRole: params.viewer.role,
    action: params.action,
    targetType: "recording-rule",
    targetId: params.rule.id,
    targetName: params.rule.titleTemplate,
    detail: {
      channelId: params.rule.channelId,
      recurrenceType: params.rule.recurrenceType,
      weekdays: params.rule.weekdays.join(","),
      timeZone: params.rule.timeZone,
      isActive: params.rule.isActive,
    },
  });
}

export async function listRecordingJobsForViewer(
  viewer: RecordingViewer,
  filters: RecordingJobViewerFilters,
) {
  const jobs = await listRecordingJobs({
    userId: viewer.id,
    includeAllUsers: canViewAllRecordings(viewer),
    search: filters.search,
    statuses: filters.statuses,
    channelId: filters.channelId,
    modes: filters.modes,
    isProtected: filters.isProtected,
    recordedAfter: filters.recordedAfter,
    recordedBefore: filters.recordedBefore,
    sort: filters.sort,
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

export async function listRecordingRulesForViewer(viewer: RecordingViewer, filters: RecordingRuleViewerFilters) {
  const rules = await listRecordingRules({
    userId: viewer.id,
    includeAllUsers: canViewAllRecordings(viewer),
    channelId: filters.channelId,
    isActive: filters.isActive,
  });
  const now = new Date();
  const jobs = await listRecordingJobsForRulesInWindow(
    rules.map((rule) => rule.id),
    new Date(now.getTime() - 4 * 60 * 60_000),
    new Date(now.getTime() + 7 * 24 * 60 * 60_000),
  );
  const jobsByRuleId = new Map<string, RecordingJobRecord[]>();

  for (const job of jobs) {
    if (!job.recordingRuleId) {
      continue;
    }

    const list = jobsByRuleId.get(job.recordingRuleId);

    if (list) {
      list.push(job);
      continue;
    }

    jobsByRuleId.set(job.recordingRuleId, [job]);
  }

  return rules.map((rule) => mapRecordingRule(rule, jobsByRuleId.get(rule.id) ?? []));
}

export async function getRecordingRuleForViewer(viewer: RecordingViewer, recordingRuleId: string) {
  const rule = await getOwnedRecordingRule(viewer, recordingRuleId);

  if (!rule) {
    throw new Error("Recording rule not found");
  }

  const now = new Date();
  const jobs = await listRecordingJobsForRulesInWindow(
    [rule.id],
    new Date(now.getTime() - 4 * 60 * 60_000),
    new Date(now.getTime() + 7 * 24 * 60 * 60_000),
  );

  return mapRecordingRule(rule, jobs);
}

export async function createRecordingJobForViewer(viewer: RecordingViewer, payload: RecordingJobInput) {
  if (payload.mode === "IMMEDIATE" && payload.startAt && Date.parse(payload.startAt) > Date.now()) {
    throw new Error("Immediate recording cannot start in the future");
  }

  const programContext = await resolveProgramEntryContext(payload);
  const channel = await getChannelById(payload.channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  const startAt = programContext?.derivedStartAt ?? resolveRecordingJobStartAt(payload);
  const endAt = programContext?.derivedEndAt ?? (payload.endAt ? new Date(payload.endAt) : null);

  if (endAt && endAt.getTime() <= Date.now()) {
    throw new Error("Recording end time must be in the future");
  }

  const title =
    payload.title ??
    programContext?.defaultTitle ??
    buildDefaultRecordingTitle({
      channelName: channel.name,
      mode: payload.mode,
      startAt,
    });

  const job = await createRecordingJob({
    channelId: channel.id,
    channelNameSnapshot: channel.name,
    channelSlugSnapshot: channel.slug,
    programEntryId: programContext?.programEntryId ?? null,
    programTitleSnapshot: programContext?.programTitleSnapshot ?? null,
    programDescriptionSnapshot: programContext?.programDescriptionSnapshot ?? null,
    programCategorySnapshot: programContext?.programCategorySnapshot ?? null,
    programStartAt: programContext?.programStartAt ?? null,
    programEndAt: programContext?.programEndAt ?? null,
    recordingRuleId: null,
    recordingRuleNameSnapshot: null,
    createdByUserId: viewer.id,
    title,
    requestedQualitySelector: payload.requestedQualitySelector,
    requestedQualityLabel: payload.requestedQualityLabel,
    mode: payload.mode,
    status: resolveInitialRecordingJobStatus({
      ...payload,
      startAt: startAt.toISOString(),
      endAt: endAt?.toISOString() ?? null,
    }),
    paddingBeforeMinutes: payload.paddingBeforeMinutes,
    paddingAfterMinutes: payload.paddingAfterMinutes,
    startAt,
    endAt,
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

  if (currentJob.recordingRuleId) {
    throw new Error("Edit the recurring rule instead of editing a generated recurring job");
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
    paddingBeforeMinutes: payload.paddingBeforeMinutes,
    paddingAfterMinutes: payload.paddingAfterMinutes,
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

  if (currentJob.recordingRuleId && (currentJob.status === "PENDING" || currentJob.status === "SCHEDULED")) {
    throw new Error("Cancel recurring occurrences instead of deleting them directly");
  }

  const deletedJob = await deleteRecordingJob(recordingJobId);
  const storagePaths = [
    ...new Set(
      [deletedJob.asset?.storagePath, deletedJob.asset?.thumbnailPath, ...deletedJob.runs.map((run) => run.storagePath)].filter(
        (storagePath): storagePath is string => Boolean(storagePath),
      ),
    ),
  ];

  await Promise.all(storagePaths.map((storagePath) => deleteRecordingFile(storagePath)));

  return undefined;
}

export async function updateRecordingRetentionForViewer(
  viewer: RecordingViewer,
  recordingJobId: string,
  payload: RecordingRetentionInput,
) {
  const currentJob = await getOwnedRecordingJob(viewer, recordingJobId);

  if (!currentJob) {
    throw new Error("Recording job not found");
  }

  const updatedJob = await updateRecordingJobRetention(recordingJobId, {
    isProtected: payload.isProtected,
    protectedAt: payload.isProtected ? new Date() : null,
  });

  await recordAdminRecordingAudit({
    viewer,
    action: payload.isProtected ? "recording-job.protect" : "recording-job.unprotect",
    job: updatedJob,
  });

  return mapRecordingJob(updatedJob);
}

export async function createRecordingRuleForViewer(viewer: RecordingViewer, payload: RecordingRuleInput) {
  const channel = await getChannelById(payload.channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  const originProgram = await resolveRuleOriginProgram(payload);
  const rule = await createRecordingRule({
    channelId: channel.id,
    createdByUserId: viewer.id,
    titleTemplate:
      payload.titleTemplate ??
      buildDefaultRecordingRuleTitle({
        channelName: channel.name,
        recurrenceType: payload.recurrenceType,
        programmeTitle: originProgram?.title ?? null,
      }),
    recurrenceType: payload.recurrenceType,
    weekdays: normalizeWeekdays(payload),
    startsAt: new Date(payload.startsAt),
    durationMinutes: payload.durationMinutes,
    timeZone: payload.timeZone,
    paddingBeforeMinutes: payload.paddingBeforeMinutes,
    paddingAfterMinutes: payload.paddingAfterMinutes,
    requestedQualitySelector: payload.requestedQualitySelector,
    requestedQualityLabel: payload.requestedQualityLabel,
    originProgramEntryId: originProgram?.id ?? null,
    originProgramTitleSnapshot: originProgram?.title ?? null,
    originProgramStartAt: originProgram?.startAt ?? null,
    originProgramEndAt: originProgram?.endAt ?? null,
    matchProgramTitle: payload.matchProgramTitle ?? originProgram?.title ?? null,
    isActive: payload.isActive,
  });

  await recordAdminRecordingRuleAudit({
    viewer,
    action: "recording-rule.create",
    rule,
  });

  if (rule.isActive) {
    await syncRecurringRecordingJobs();
  }

  pokeRecordingRuntime();
  const jobs = await listRecordingJobsForRulesInWindow(
    [rule.id],
    new Date(Date.now() - 4 * 60 * 60_000),
    new Date(Date.now() + 7 * 24 * 60 * 60_000),
  );
  return mapRecordingRule(rule, jobs);
}

export async function updateRecordingRuleForViewer(
  viewer: RecordingViewer,
  recordingRuleId: string,
  payload: RecordingRuleInput,
) {
  const currentRule = await getOwnedRecordingRule(viewer, recordingRuleId);

  if (!currentRule) {
    throw new Error("Recording rule not found");
  }

  const channel = await getChannelById(payload.channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  const originProgram = await resolveRuleOriginProgram(payload);
  await deleteUpcomingGeneratedJobsForRule(recordingRuleId, new Date());

  const updatedRule = await updateRecordingRule(recordingRuleId, {
    channelId: channel.id,
    titleTemplate:
      payload.titleTemplate ??
      buildDefaultRecordingRuleTitle({
        channelName: channel.name,
        recurrenceType: payload.recurrenceType,
        programmeTitle: originProgram?.title ?? null,
      }),
    recurrenceType: payload.recurrenceType,
    weekdays: normalizeWeekdays(payload),
    startsAt: new Date(payload.startsAt),
    durationMinutes: payload.durationMinutes,
    timeZone: payload.timeZone,
    paddingBeforeMinutes: payload.paddingBeforeMinutes,
    paddingAfterMinutes: payload.paddingAfterMinutes,
    requestedQualitySelector: payload.requestedQualitySelector,
    requestedQualityLabel: payload.requestedQualityLabel,
    originProgramEntryId: originProgram?.id ?? null,
    originProgramTitleSnapshot: originProgram?.title ?? null,
    originProgramStartAt: originProgram?.startAt ?? null,
    originProgramEndAt: originProgram?.endAt ?? null,
    matchProgramTitle: payload.matchProgramTitle ?? originProgram?.title ?? null,
    isActive: payload.isActive,
  });

  await recordAdminRecordingRuleAudit({
    viewer,
    action: "recording-rule.update",
    rule: updatedRule,
  });

  if (updatedRule.isActive) {
    await syncRecurringRecordingJobs();
  }

  pokeRecordingRuntime();
  const jobs = await listRecordingJobsForRulesInWindow(
    [updatedRule.id],
    new Date(Date.now() - 4 * 60 * 60_000),
    new Date(Date.now() + 7 * 24 * 60 * 60_000),
  );
  return mapRecordingRule(updatedRule, jobs);
}

export async function deleteRecordingRuleForViewer(viewer: RecordingViewer, recordingRuleId: string) {
  const currentRule = await getOwnedRecordingRule(viewer, recordingRuleId);

  if (!currentRule) {
    throw new Error("Recording rule not found");
  }

  await deleteUpcomingGeneratedJobsForRule(recordingRuleId, new Date());
  const deletedRule = await deleteRecordingRule(recordingRuleId);

  await recordAdminRecordingRuleAudit({
    viewer,
    action: "recording-rule.delete",
    rule: deletedRule,
  });

  pokeRecordingRuntime();
}

export async function getRecordingPlaybackAccessForViewer(viewer: RecordingViewer, recordingJobId: string) {
  const playbackJob = await findRecordingPlaybackJobById(recordingJobId);

  if (!playbackJob || (!canViewAllRecordings(viewer) && playbackJob.createdByUserId !== viewer.id)) {
    throw new Error("Recording job not found");
  }

  if (!playbackJob.asset) {
    throw new Error("Recording media is not available");
  }

  return {
    playbackUrl: buildRecordingAssetAccess(recordingJobId, playbackJob.asset.id).playbackUrl,
  };
}

export async function listRecordingCatchupCandidatesForViewer(
  viewer: RecordingViewer,
  params: {
    channelId: string;
    rangeStart: Date;
    rangeEnd: Date;
  },
) {
  const candidates = await listRecordingCatchupCandidates({
    channelId: params.channelId,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
    userId: viewer.id,
    includeAllUsers: canViewAllRecordings(viewer),
  });

  return candidates.flatMap((candidate) => {
    if (!candidate.asset) {
      return [];
    }

    return [
      {
        recordingJobId: candidate.id,
        programEntryId: candidate.programEntryId,
        title: candidate.title,
        startsAt: candidate.asset.startedAt,
        endsAt: candidate.asset.endedAt,
      },
    ];
  });
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

export async function getRecordingThumbnailByPlaybackToken(recordingJobId: string, token: string) {
  const payload = readRecordingPlaybackToken(token, recordingJobId);

  if (!payload) {
    return null;
  }

  const playbackJob = await findRecordingPlaybackJobById(recordingJobId);

  if (!playbackJob?.asset || playbackJob.asset.id !== payload.recordingAssetId) {
    return null;
  }

  if (playbackJob.asset.thumbnailPath && playbackJob.asset.thumbnailMimeType) {
    return playbackJob.asset;
  }

  const generatedThumbnail = await generateRecordingThumbnail({
    storagePath: playbackJob.asset.storagePath,
    durationSeconds: playbackJob.asset.durationSeconds,
  });

  if (!generatedThumbnail) {
    return null;
  }

  return updateRecordingAssetThumbnail(playbackJob.asset.id, generatedThumbnail);
}
