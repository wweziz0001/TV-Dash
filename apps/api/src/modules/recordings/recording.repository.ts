import type {
  RecordingJobStatus,
  RecordingMode,
  RecordingRecurrenceType,
  RecordingRunStatus,
  RecordingWeekday,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export type RecordingJobListSort =
  | "RECORDED_DESC"
  | "RECORDED_ASC"
  | "TITLE_ASC"
  | "TITLE_DESC"
  | "CHANNEL_ASC"
  | "CHANNEL_DESC"
  | "STATUS_ASC"
  | "STATUS_DESC";

const recordingChannelSummarySelect = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
} satisfies Prisma.ChannelSelect;

const recordingAssetSelect = {
  id: true,
  recordingJobId: true,
  recordingRunId: true,
  channelId: true,
  channelNameSnapshot: true,
  channelSlugSnapshot: true,
  title: true,
  storagePath: true,
  fileName: true,
  mimeType: true,
  containerFormat: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  fileSizeBytes: true,
  thumbnailPath: true,
  thumbnailMimeType: true,
  thumbnailGeneratedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RecordingAssetSelect;

const recordingProgramSummarySelect = {
  id: true,
  sourceKind: true,
  title: true,
  description: true,
  category: true,
  imageUrl: true,
  startAt: true,
  endAt: true,
} satisfies Prisma.ProgramEntrySelect;

const recordingRuleSummarySelect = {
  id: true,
  channelId: true,
  titleTemplate: true,
  recurrenceType: true,
  weekdays: true,
  startsAt: true,
  durationMinutes: true,
  timeZone: true,
  paddingBeforeMinutes: true,
  paddingAfterMinutes: true,
  requestedQualitySelector: true,
  requestedQualityLabel: true,
  originProgramTitleSnapshot: true,
  originProgramStartAt: true,
  originProgramEndAt: true,
  matchProgramTitle: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RecordingRuleSelect;

const recordingRunSelect = {
  id: true,
  recordingJobId: true,
  status: true,
  storagePath: true,
  outputFileName: true,
  containerFormat: true,
  ffmpegPid: true,
  startedAt: true,
  endedAt: true,
  exitCode: true,
  exitSignal: true,
  failureReason: true,
  stderrTail: true,
  fileSizeBytes: true,
  durationSeconds: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RecordingRunSelect;

export const recordingJobInclude = {
  programEntry: {
    select: recordingProgramSummarySelect,
  },
  recordingRule: {
    select: recordingRuleSummarySelect,
  },
  channel: {
    select: recordingChannelSummarySelect,
  },
  asset: {
    select: recordingAssetSelect,
  },
  runs: {
    select: recordingRunSelect,
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  },
  createdByUser: {
    select: {
      id: true,
      username: true,
      role: true,
    },
  },
} satisfies Prisma.RecordingJobInclude;

const recordingRuleInclude = {
  channel: {
    select: recordingChannelSummarySelect,
  },
  createdByUser: {
    select: {
      id: true,
      username: true,
      role: true,
    },
  },
  originProgramEntry: {
    select: recordingProgramSummarySelect,
  },
} satisfies Prisma.RecordingRuleInclude;

const recordingRuntimeJobSelect = {
  id: true,
  channelId: true,
  channelNameSnapshot: true,
  channelSlugSnapshot: true,
  programEntryId: true,
  programTitleSnapshot: true,
  programStartAt: true,
  programEndAt: true,
  recordingRuleId: true,
  recordingRuleNameSnapshot: true,
  title: true,
  requestedQualitySelector: true,
  requestedQualityLabel: true,
  mode: true,
  status: true,
  paddingBeforeMinutes: true,
  paddingAfterMinutes: true,
  startAt: true,
  endAt: true,
  actualStartAt: true,
  actualEndAt: true,
  failureReason: true,
  cancellationReason: true,
  createdByUserId: true,
  asset: {
    select: {
      id: true,
    },
  },
  channel: {
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
    },
  },
  runs: {
    select: recordingRunSelect,
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  },
} satisfies Prisma.RecordingJobSelect;

const recordingPlaybackJobSelect = {
  id: true,
  createdByUserId: true,
  asset: {
    select: recordingAssetSelect,
  },
} satisfies Prisma.RecordingJobSelect;

export type RecordingJobRecord = Prisma.RecordingJobGetPayload<{ include: typeof recordingJobInclude }>;
export type RecordingRuntimeJobRecord = Prisma.RecordingJobGetPayload<{ select: typeof recordingRuntimeJobSelect }>;
export type RecordingPlaybackJobRecord = Prisma.RecordingJobGetPayload<{ select: typeof recordingPlaybackJobSelect }>;
export type RecordingRuleRecord = Prisma.RecordingRuleGetPayload<{ include: typeof recordingRuleInclude }>;

interface RecordingJobListFilters {
  userId: string;
  includeAllUsers?: boolean;
  search?: string;
  statuses?: RecordingJobStatus[];
  channelId?: string;
  modes?: RecordingMode[];
  isProtected?: boolean;
  recordedAfter?: Date;
  recordedBefore?: Date;
  sort?: RecordingJobListSort;
}

function resolveRecordingJobOrderBy(sort: RecordingJobListSort | undefined): Prisma.RecordingJobOrderByWithRelationInput[] {
  switch (sort) {
    case "RECORDED_ASC":
      return [{ startAt: "asc" }, { createdAt: "asc" }];
    case "TITLE_ASC":
      return [{ title: "asc" }, { startAt: "desc" }];
    case "TITLE_DESC":
      return [{ title: "desc" }, { startAt: "desc" }];
    case "CHANNEL_ASC":
      return [{ channelNameSnapshot: "asc" }, { startAt: "desc" }];
    case "CHANNEL_DESC":
      return [{ channelNameSnapshot: "desc" }, { startAt: "desc" }];
    case "STATUS_ASC":
      return [{ status: "asc" }, { startAt: "desc" }];
    case "STATUS_DESC":
      return [{ status: "desc" }, { startAt: "desc" }];
    case "RECORDED_DESC":
    default:
      return [{ startAt: "desc" }, { createdAt: "desc" }];
  }
}

function buildRecordingJobWhere(filters: RecordingJobListFilters): Prisma.RecordingJobWhereInput {
  const where: Prisma.RecordingJobWhereInput = {};

  if (!filters.includeAllUsers) {
    where.createdByUserId = filters.userId;
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { channelNameSnapshot: { contains: filters.search, mode: "insensitive" } },
      { channelSlugSnapshot: { contains: filters.search, mode: "insensitive" } },
      { programTitleSnapshot: { contains: filters.search, mode: "insensitive" } },
      { programDescriptionSnapshot: { contains: filters.search, mode: "insensitive" } },
      { programCategorySnapshot: { contains: filters.search, mode: "insensitive" } },
      { recordingRuleNameSnapshot: { contains: filters.search, mode: "insensitive" } },
      { asset: { is: { fileName: { contains: filters.search, mode: "insensitive" } } } },
    ];
  }

  if (filters.statuses?.length) {
    where.status = {
      in: filters.statuses,
    };
  }

  if (filters.channelId) {
    where.channelId = filters.channelId;
  }

  if (filters.modes?.length) {
    where.mode = {
      in: filters.modes,
    };
  }

  if (typeof filters.isProtected === "boolean") {
    where.isProtected = filters.isProtected;
  }

  if (filters.recordedAfter || filters.recordedBefore) {
    where.startAt = {
      ...(filters.recordedAfter ? { gte: filters.recordedAfter } : {}),
      ...(filters.recordedBefore ? { lte: filters.recordedBefore } : {}),
    };
  }

  return where;
}

export function listRecordingJobs(filters: RecordingJobListFilters) {
  return prisma.recordingJob.findMany({
    where: buildRecordingJobWhere(filters),
    orderBy: resolveRecordingJobOrderBy(filters.sort),
    include: recordingJobInclude,
  });
}

export function findRecordingJobById(id: string) {
  return prisma.recordingJob.findUnique({
    where: { id },
    include: recordingJobInclude,
  });
}

export function findRecordingPlaybackJobById(id: string) {
  return prisma.recordingJob.findUnique({
    where: { id },
    select: recordingPlaybackJobSelect,
  });
}

export function findRecordingRuntimeJobById(id: string) {
  return prisma.recordingJob.findUnique({
    where: { id },
    select: recordingRuntimeJobSelect,
  });
}

export function createRecordingJob(data: {
  channelId: string;
  channelNameSnapshot: string;
  channelSlugSnapshot: string;
  programEntryId: string | null;
  programTitleSnapshot: string | null;
  programDescriptionSnapshot: string | null;
  programCategorySnapshot: string | null;
  programStartAt: Date | null;
  programEndAt: Date | null;
  recordingRuleId: string | null;
  recordingRuleNameSnapshot: string | null;
  createdByUserId: string;
  title: string;
  requestedQualitySelector: string | null;
  requestedQualityLabel: string | null;
  mode: RecordingMode;
  status: RecordingJobStatus;
  paddingBeforeMinutes: number;
  paddingAfterMinutes: number;
  startAt: Date;
  endAt: Date | null;
}) {
  return prisma.recordingJob.create({
    data,
    include: recordingJobInclude,
  });
}

export function updateRecordingJobSchedule(
  id: string,
  data: {
    channelId: string;
    channelNameSnapshot: string;
    channelSlugSnapshot: string;
    title: string;
    paddingBeforeMinutes: number;
    paddingAfterMinutes: number;
    requestedQualitySelector: string | null;
    requestedQualityLabel: string | null;
    startAt: Date;
    endAt: Date;
    status: RecordingJobStatus;
  },
) {
  return prisma.recordingJob.update({
    where: { id },
    data,
    include: recordingJobInclude,
  });
}

export function updateRecordingJobRetention(
  id: string,
  data: {
    isProtected: boolean;
    protectedAt: Date | null;
  },
) {
  return prisma.recordingJob.update({
    where: { id },
    data,
    include: recordingJobInclude,
  });
}

export function cancelRecordingJob(id: string, cancellationReason: string | null) {
  return prisma.recordingJob.update({
    where: { id },
    data: {
      status: "CANCELED",
      cancellationReason,
      actualEndAt: new Date(),
    },
    include: recordingJobInclude,
  });
}

export function deleteRecordingJob(id: string) {
  return prisma.recordingJob.delete({
    where: { id },
    include: {
      asset: {
        select: {
          storagePath: true,
          thumbnailPath: true,
        },
      },
      runs: {
        select: {
          storagePath: true,
        },
      },
    },
  });
}

export function listDueRecordingJobs(now: Date, limit = 10) {
  return prisma.recordingJob.findMany({
    where: {
      status: {
        in: ["PENDING", "SCHEDULED"],
      },
      startAt: {
        lte: now,
      },
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
    },
  });
}

export function listRunningRecordingJobs() {
  return prisma.recordingJob.findMany({
    where: {
      status: "RECORDING",
    },
    select: {
      id: true,
      endAt: true,
    },
  });
}

interface RecordingRuleListFilters {
  userId: string;
  includeAllUsers?: boolean;
  channelId?: string;
  isActive?: boolean;
}

function buildRecordingRuleWhere(filters: RecordingRuleListFilters): Prisma.RecordingRuleWhereInput {
  const where: Prisma.RecordingRuleWhereInput = {};

  if (!filters.includeAllUsers) {
    where.createdByUserId = filters.userId;
  }

  if (filters.channelId) {
    where.channelId = filters.channelId;
  }

  if (typeof filters.isActive === "boolean") {
    where.isActive = filters.isActive;
  }

  return where;
}

export function listRecordingRules(filters: RecordingRuleListFilters) {
  return prisma.recordingRule.findMany({
    where: buildRecordingRuleWhere(filters),
    orderBy: [{ isActive: "desc" }, { startsAt: "asc" }, { createdAt: "asc" }],
    include: recordingRuleInclude,
  });
}

export function findRecordingRuleById(id: string) {
  return prisma.recordingRule.findUnique({
    where: { id },
    include: recordingRuleInclude,
  });
}

export function createRecordingRule(data: {
  channelId: string;
  createdByUserId: string;
  titleTemplate: string;
  recurrenceType: RecordingRecurrenceType;
  weekdays: RecordingWeekday[];
  startsAt: Date;
  durationMinutes: number;
  timeZone: string;
  paddingBeforeMinutes: number;
  paddingAfterMinutes: number;
  requestedQualitySelector: string | null;
  requestedQualityLabel: string | null;
  originProgramEntryId: string | null;
  originProgramTitleSnapshot: string | null;
  originProgramStartAt: Date | null;
  originProgramEndAt: Date | null;
  matchProgramTitle: string | null;
  isActive: boolean;
}) {
  return prisma.recordingRule.create({
    data,
    include: recordingRuleInclude,
  });
}

export function updateRecordingRule(
  id: string,
  data: {
    channelId: string;
    titleTemplate: string;
    recurrenceType: RecordingRecurrenceType;
    weekdays: RecordingWeekday[];
    startsAt: Date;
    durationMinutes: number;
    timeZone: string;
    paddingBeforeMinutes: number;
    paddingAfterMinutes: number;
    requestedQualitySelector: string | null;
    requestedQualityLabel: string | null;
    originProgramEntryId: string | null;
    originProgramTitleSnapshot: string | null;
    originProgramStartAt: Date | null;
    originProgramEndAt: Date | null;
    matchProgramTitle: string | null;
    isActive: boolean;
  },
) {
  return prisma.recordingRule.update({
    where: { id },
    data,
    include: recordingRuleInclude,
  });
}

export function deleteRecordingRule(id: string) {
  return prisma.recordingRule.delete({
    where: { id },
    include: recordingRuleInclude,
  });
}

export function listActiveRecordingRules() {
  return prisma.recordingRule.findMany({
    where: {
      isActive: true,
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    include: recordingRuleInclude,
  });
}

export function listRecordingJobsForRulesInWindow(recordingRuleIds: string[], startAt: Date, endAt: Date) {
  if (recordingRuleIds.length === 0) {
    return Promise.resolve([] as RecordingJobRecord[]);
  }

  return prisma.recordingJob.findMany({
    where: {
      recordingRuleId: {
        in: recordingRuleIds,
      },
      startAt: {
        gte: startAt,
        lt: endAt,
      },
    },
    include: recordingJobInclude,
  });
}

export function createManyRecordingJobs(
  data: Array<{
    channelId: string;
    channelNameSnapshot: string;
    channelSlugSnapshot: string;
    programEntryId: string | null;
    programTitleSnapshot: string | null;
    programDescriptionSnapshot: string | null;
    programCategorySnapshot: string | null;
    programStartAt: Date | null;
    programEndAt: Date | null;
    recordingRuleId: string | null;
    recordingRuleNameSnapshot: string | null;
    createdByUserId: string;
    title: string;
    requestedQualitySelector: string | null;
    requestedQualityLabel: string | null;
    mode: RecordingMode;
    status: RecordingJobStatus;
    paddingBeforeMinutes: number;
    paddingAfterMinutes: number;
    startAt: Date;
    endAt: Date | null;
  }>,
) {
  if (data.length === 0) {
    return Promise.resolve({ count: 0 });
  }

  return prisma.recordingJob.createMany({
    data,
    skipDuplicates: true,
  });
}

export function deleteUpcomingGeneratedJobsForRule(recordingRuleId: string, now: Date) {
  return prisma.recordingJob.deleteMany({
    where: {
      recordingRuleId,
      status: {
        in: ["PENDING", "SCHEDULED"],
      },
      startAt: {
        gte: now,
      },
      actualStartAt: null,
    },
  });
}

export function markInterruptedRecordingRunsFailed(reason: string) {
  const now = new Date();

  return prisma.$transaction([
    prisma.recordingRun.updateMany({
      where: {
        status: {
          in: ["STARTING", "RECORDING"],
        },
      },
      data: {
        status: "FAILED",
        failureReason: reason,
        endedAt: now,
        updatedAt: now,
      },
    }),
    prisma.recordingJob.updateMany({
      where: {
        status: {
          in: ["PENDING", "RECORDING"],
        },
      },
      data: {
        status: "FAILED",
        failureReason: reason,
        actualEndAt: now,
        updatedAt: now,
      },
    }),
  ]);
}

export function failRecordingJobBeforeStart(recordingJobId: string, reason: string) {
  const now = new Date();

  return prisma.recordingJob.update({
    where: { id: recordingJobId },
    data: {
      status: "FAILED",
      failureReason: reason,
      actualEndAt: now,
    },
    select: recordingRuntimeJobSelect,
  });
}

export async function claimRecordingJobStart(params: {
  recordingJobId: string;
  storagePath: string;
  outputFileName: string;
  containerFormat: string;
}) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.recordingJob.findUnique({
      where: {
        id: params.recordingJobId,
      },
      select: recordingRuntimeJobSelect,
    });

    if (!job || (job.status !== "PENDING" && job.status !== "SCHEDULED")) {
      return null;
    }

    const updatedJob = await tx.recordingJob.update({
      where: {
        id: params.recordingJobId,
      },
      data: {
        status: "RECORDING",
        actualStartAt: new Date(),
        actualEndAt: null,
        failureReason: null,
        cancellationReason: null,
      },
      select: recordingRuntimeJobSelect,
    });

    const run = await tx.recordingRun.create({
      data: {
        recordingJobId: params.recordingJobId,
        status: "STARTING",
        storagePath: params.storagePath,
        outputFileName: params.outputFileName,
        containerFormat: params.containerFormat,
      },
      select: recordingRunSelect,
    });

    return {
      job: updatedJob,
      run,
    };
  });
}

export function markRecordingRunStarted(runId: string, ffmpegPid: number | null, startedAt: Date) {
  return prisma.recordingRun.update({
    where: { id: runId },
    data: {
      status: "RECORDING",
      ffmpegPid,
      startedAt,
    },
    select: recordingRunSelect,
  });
}

export async function finalizeRecordingRun(params: {
  recordingJobId: string;
  recordingRunId: string;
  runStatus: RecordingRunStatus;
  jobStatus: RecordingJobStatus;
  endedAt: Date;
  exitCode: number | null;
  exitSignal: string | null;
  failureReason: string | null;
  stderrTail: string | null;
  fileSizeBytes: bigint | null;
  durationSeconds: number | null;
  createAsset: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const currentRun = await tx.recordingRun.findUnique({
      where: { id: params.recordingRunId },
      select: recordingRunSelect,
    });
    const currentJob = await tx.recordingJob.findUnique({
      where: { id: params.recordingJobId },
      select: recordingRuntimeJobSelect,
    });

    if (!currentRun || !currentJob) {
      return null;
    }

    const run = await tx.recordingRun.update({
      where: {
        id: params.recordingRunId,
      },
      data: {
        status: params.runStatus,
        endedAt: params.endedAt,
        exitCode: params.exitCode,
        exitSignal: params.exitSignal,
        failureReason: params.failureReason,
        stderrTail: params.stderrTail,
        fileSizeBytes: params.fileSizeBytes,
        durationSeconds: params.durationSeconds,
      },
      select: recordingRunSelect,
    });

    const job = await tx.recordingJob.update({
      where: {
        id: params.recordingJobId,
      },
      data: {
        status: params.jobStatus,
        actualEndAt: params.endedAt,
        failureReason: params.jobStatus === "FAILED" ? params.failureReason : null,
        cancellationReason: params.jobStatus === "CANCELED" ? params.failureReason : null,
      },
      select: recordingRuntimeJobSelect,
    });

    if (
      params.createAsset &&
      !currentJob.asset &&
      currentRun.startedAt &&
      params.fileSizeBytes !== null &&
      params.fileSizeBytes > BigInt(0)
    ) {
      await tx.recordingAsset.create({
        data: {
          recordingJobId: currentJob.id,
          recordingRunId: run.id,
          channelId: currentJob.channelId ?? null,
          channelNameSnapshot: currentJob.channelNameSnapshot,
          channelSlugSnapshot: currentJob.channelSlugSnapshot,
          title: currentJob.title,
          storagePath: run.storagePath,
          fileName: run.outputFileName,
          mimeType: "video/mp4",
          containerFormat: run.containerFormat,
          startedAt: currentRun.startedAt,
          endedAt: params.endedAt,
          durationSeconds: params.durationSeconds,
          fileSizeBytes: params.fileSizeBytes,
        },
      });
    }

    return {
      job,
      run,
    };
  });
}

const recordingThumbnailAssetSelect = {
  id: true,
  recordingJobId: true,
  storagePath: true,
  durationSeconds: true,
  thumbnailPath: true,
  thumbnailMimeType: true,
  thumbnailGeneratedAt: true,
} satisfies Prisma.RecordingAssetSelect;

export type RecordingThumbnailAssetRecord = Prisma.RecordingAssetGetPayload<{ select: typeof recordingThumbnailAssetSelect }>;

export function findRecordingThumbnailAssetByJobId(recordingJobId: string) {
  return prisma.recordingAsset.findUnique({
    where: {
      recordingJobId,
    },
    select: recordingThumbnailAssetSelect,
  });
}

export function updateRecordingAssetThumbnail(
  id: string,
  data: {
    thumbnailPath: string | null;
    thumbnailMimeType: string | null;
    thumbnailGeneratedAt: Date | null;
  },
) {
  return prisma.recordingAsset.update({
    where: { id },
    data,
    select: recordingThumbnailAssetSelect,
  });
}

const recordingRetentionCandidateSelect = {
  id: true,
  title: true,
  channelId: true,
  channelNameSnapshot: true,
  status: true,
  isProtected: true,
  startAt: true,
  actualEndAt: true,
  createdAt: true,
  asset: {
    select: {
      id: true,
      storagePath: true,
      thumbnailPath: true,
      endedAt: true,
      createdAt: true,
    },
  },
  runs: {
    select: {
      id: true,
      storagePath: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  },
} satisfies Prisma.RecordingJobSelect;

export type RecordingRetentionCandidateRecord = Prisma.RecordingJobGetPayload<{
  select: typeof recordingRetentionCandidateSelect;
}>;

export function listRecordingRetentionCandidates() {
  return prisma.recordingJob.findMany({
    where: {
      status: {
        in: ["COMPLETED", "FAILED", "CANCELED"],
      },
    },
    select: recordingRetentionCandidateSelect,
    orderBy: [{ channelId: "asc" }, { actualEndAt: "desc" }, { startAt: "desc" }, { createdAt: "desc" }],
  });
}
