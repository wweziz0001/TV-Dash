import type {
  EpgChannelMappingInput,
  EpgSourceInput,
  ProgramEntryInput,
} from "@tv-dash/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

const epgSourceInclude = {
  sourceChannels: {
    select: {
      id: true,
      isAvailable: true,
      mapping: {
        select: {
          id: true,
        },
      },
    },
  },
  _count: {
    select: {
      importedPrograms: true,
    },
  },
} satisfies Prisma.EpgSourceInclude;

const epgSourceDetailInclude = {
  ...epgSourceInclude,
  sourceChannels: {
    orderBy: [{ isAvailable: "desc" }, { displayName: "asc" }],
    include: {
      mapping: {
        select: {
          id: true,
          channel: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.EpgSourceInclude;

export type EpgSourceRecord = Prisma.EpgSourceGetPayload<{ include: typeof epgSourceInclude }>;
export type EpgSourceDetailRecord = Prisma.EpgSourceGetPayload<{ include: typeof epgSourceDetailInclude }>;

function mapEpgSourceInput(data: EpgSourceInput): Prisma.EpgSourceUncheckedCreateInput {
  return {
    name: data.name,
    slug: data.slug,
    sourceType: data.sourceType,
    url: data.sourceType === "XMLTV_URL" ? data.url : null,
    isActive: data.isActive,
    refreshIntervalMinutes: data.sourceType === "XMLTV_URL" ? data.refreshIntervalMinutes : null,
    requestUserAgent: data.sourceType === "XMLTV_URL" ? data.requestUserAgent : null,
    requestReferrer: data.sourceType === "XMLTV_URL" ? data.requestReferrer : null,
    requestHeaders:
      data.sourceType === "XMLTV_URL" && Object.keys(data.requestHeaders).length ? data.requestHeaders : Prisma.DbNull,
  };
}

function mapManualProgramInput(data: ProgramEntryInput): Prisma.ProgramEntryUncheckedCreateInput {
  return {
    sourceKind: "MANUAL",
    channelId: data.channelId,
    title: data.title,
    subtitle: data.subtitle,
    description: data.description,
    category: data.category,
    imageUrl: data.imageUrl,
    startAt: new Date(data.startAt),
    endAt: new Date(data.endAt),
  };
}

export function listEpgSources() {
  return prisma.epgSource.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: epgSourceInclude,
  });
}

export function findEpgSourceById(id: string) {
  return prisma.epgSource.findUnique({
    where: { id },
    include: epgSourceDetailInclude,
  });
}

export function findEpgSourceImportConfigById(id: string) {
  return prisma.epgSource.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      sourceType: true,
      url: true,
      uploadedFileName: true,
      isActive: true,
      refreshIntervalMinutes: true,
      requestUserAgent: true,
      requestReferrer: true,
      requestHeaders: true,
      lastImportStartedAt: true,
      lastImportedAt: true,
      lastImportStatus: true,
      lastImportMessage: true,
      lastImportChannelCount: true,
      lastImportProgramCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export function createEpgSource(data: EpgSourceInput) {
  return prisma.epgSource.create({
    data: mapEpgSourceInput(data),
    include: epgSourceInclude,
  });
}

export function updateEpgSource(id: string, data: EpgSourceInput) {
  return prisma.epgSource.update({
    where: { id },
    data: mapEpgSourceInput(data),
    include: epgSourceInclude,
  });
}

export function deleteEpgSource(id: string) {
  return prisma.epgSource.delete({
    where: { id },
  });
}

export async function markEpgSourceImportFailure(sourceId: string, message: string, startedAt: Date) {
  return prisma.epgSource.update({
    where: { id: sourceId },
    data: {
      lastImportStartedAt: startedAt,
      lastImportStatus: "FAILED",
      lastImportMessage: message.slice(0, 500),
    },
    include: epgSourceInclude,
  });
}

export async function replaceImportedGuideData(params: {
  sourceId: string;
  uploadedFileName?: string | null;
  importedAt: Date;
  channels: Array<{
    externalId: string;
    displayName: string;
    displayNames: string[];
    iconUrl: string | null;
  }>;
  programmes: Array<{
    sourceChannelExternalId: string;
    externalProgramId: string | null;
    title: string;
    subtitle: string | null;
    description: string | null;
    category: string | null;
    imageUrl: string | null;
    startAt: Date;
    endAt: Date | null;
  }>;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.epgSourceChannel.updateMany({
      where: { sourceId: params.sourceId },
      data: {
        isAvailable: false,
      },
    });

    for (const channel of params.channels) {
      await tx.epgSourceChannel.upsert({
        where: {
          sourceId_externalId: {
            sourceId: params.sourceId,
            externalId: channel.externalId,
          },
        },
        update: {
          displayName: channel.displayName,
          displayNames: channel.displayNames.length ? channel.displayNames : Prisma.DbNull,
          iconUrl: channel.iconUrl,
          isAvailable: true,
          lastSeenAt: params.importedAt,
        },
        create: {
          sourceId: params.sourceId,
          externalId: channel.externalId,
          displayName: channel.displayName,
          displayNames: channel.displayNames.length ? channel.displayNames : Prisma.DbNull,
          iconUrl: channel.iconUrl,
          isAvailable: true,
          lastSeenAt: params.importedAt,
        },
      });
    }

    const sourceChannels = await tx.epgSourceChannel.findMany({
      where: {
        sourceId: params.sourceId,
      },
      select: {
        id: true,
        externalId: true,
      },
    });
    const sourceChannelIdByExternalId = new Map(sourceChannels.map((channel) => [channel.externalId, channel.id]));

    await tx.programEntry.deleteMany({
      where: {
        sourceId: params.sourceId,
        sourceKind: "IMPORTED",
      },
    });

    if (params.programmes.length > 0) {
      await tx.programEntry.createMany({
        data: params.programmes.flatMap((programme) => {
          const sourceChannelId = sourceChannelIdByExternalId.get(programme.sourceChannelExternalId);

          if (!sourceChannelId) {
            return [];
          }

          return [
            {
              sourceKind: "IMPORTED" as const,
              sourceId: params.sourceId,
              sourceChannelId,
              externalProgramId: programme.externalProgramId,
              title: programme.title,
              subtitle: programme.subtitle,
              description: programme.description,
              category: programme.category,
              imageUrl: programme.imageUrl,
              startAt: programme.startAt,
              endAt: programme.endAt,
            },
          ];
        }),
      });
    }

    return tx.epgSource.update({
      where: { id: params.sourceId },
      data: {
        uploadedFileName: params.uploadedFileName ?? undefined,
        lastImportStartedAt: params.importedAt,
        lastImportedAt: params.importedAt,
        lastImportStatus: "SUCCEEDED",
        lastImportMessage: `Imported ${params.channels.length} channel(s) and ${params.programmes.length} programme(s)`,
        lastImportChannelCount: params.channels.length,
        lastImportProgramCount: params.programmes.length,
      },
      include: epgSourceDetailInclude,
    });
  });
}

export function listEpgSourceChannels(sourceId: string, search?: string) {
  return prisma.epgSourceChannel.findMany({
    where: {
      sourceId,
      ...(search
        ? {
            OR: [
              { externalId: { contains: search, mode: "insensitive" } },
              { displayName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ isAvailable: "desc" }, { displayName: "asc" }],
    include: {
      source: {
        select: {
          id: true,
          name: true,
          slug: true,
          sourceType: true,
          isActive: true,
        },
      },
      mapping: {
        select: {
          id: true,
          channel: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
            },
          },
        },
      },
    },
  });
}

export function upsertEpgChannelMapping({ channelId, sourceChannelId }: EpgChannelMappingInput) {
  if (!sourceChannelId) {
    return prisma.epgChannelMapping.deleteMany({
      where: {
        channelId,
      },
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.epgChannelMapping.deleteMany({
      where: {
        OR: [{ channelId }, { sourceChannelId }],
      },
    });

    return tx.epgChannelMapping.create({
      data: {
        channelId,
        sourceChannelId,
      },
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
        sourceChannel: {
          include: {
            source: {
              select: {
                id: true,
                name: true,
                slug: true,
                sourceType: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
  });
}

export function listManualPrograms(channelId?: string) {
  return prisma.programEntry.findMany({
    where: {
      sourceKind: "MANUAL",
      ...(channelId ? { channelId } : {}),
    },
    orderBy: [{ startAt: "asc" }, { title: "asc" }],
    include: {
      channel: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      },
    },
  });
}

export function findManualProgramById(id: string) {
  return prisma.programEntry.findFirst({
    where: {
      id,
      sourceKind: "MANUAL",
    },
    include: {
      channel: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      },
    },
  });
}

export function findProgramEntryById(id: string) {
  return prisma.programEntry.findUnique({
    where: { id },
    include: {
      channel: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      },
      sourceChannel: {
        select: {
          id: true,
          externalId: true,
          source: {
            select: {
              id: true,
              name: true,
              slug: true,
              sourceType: true,
              isActive: true,
            },
          },
        },
      },
    },
  });
}

export function createManualProgram(data: ProgramEntryInput) {
  return prisma.programEntry.create({
    data: mapManualProgramInput(data),
    include: {
      channel: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      },
    },
  });
}

export function updateManualProgram(id: string, data: ProgramEntryInput) {
  return prisma.programEntry.update({
    where: { id },
    data: mapManualProgramInput(data),
    include: {
      channel: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      },
    },
  });
}

export function deleteManualProgram(id: string) {
  return prisma.programEntry.delete({
    where: { id },
  });
}

export function findOverlappingManualPrograms(params: {
  channelId: string;
  startAt: Date;
  endAt: Date;
  excludeId?: string;
}) {
  return prisma.programEntry.findMany({
    where: {
      sourceKind: "MANUAL",
      channelId: params.channelId,
      id: params.excludeId
        ? {
            not: params.excludeId,
          }
        : undefined,
      startAt: {
        lt: params.endAt,
      },
      OR: [{ endAt: null }, { endAt: { gt: params.startAt } }],
    },
    orderBy: [{ startAt: "asc" }],
  });
}

export function listManualProgramsForChannels(channelIds: string[], rangeStart: Date, rangeEnd: Date) {
  return prisma.programEntry.findMany({
    where: {
      sourceKind: "MANUAL",
      channelId: {
        in: channelIds,
      },
      startAt: {
        lt: rangeEnd,
      },
      OR: [{ endAt: null }, { endAt: { gt: rangeStart } }],
    },
    orderBy: [{ startAt: "asc" }],
  });
}

export function listImportedProgramsForSourceChannels(sourceChannelIds: string[], rangeStart: Date, rangeEnd: Date) {
  return prisma.programEntry.findMany({
    where: {
      sourceKind: "IMPORTED",
      sourceChannelId: {
        in: sourceChannelIds,
      },
      startAt: {
        lt: rangeEnd,
      },
      OR: [{ endAt: null }, { endAt: { gt: rangeStart } }],
    },
    orderBy: [{ startAt: "asc" }],
  });
}
