import type { ChannelInput, ChannelQualityVariantInput } from "@tv-dash/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

interface ChannelQueryParams {
  search?: string;
  groupId?: string;
  active?: string;
}

export const publicChannelInclude = {
  group: true,
  epgSource: {
    select: {
      id: true,
      name: true,
      slug: true,
      sourceType: true,
      isActive: true,
    },
  },
  qualityVariants: {
    where: {
      isActive: true,
    },
    select: {
      id: true,
    },
  },
} satisfies Prisma.ChannelInclude;

const channelConfigInclude = {
  group: true,
  epgSource: {
    select: {
      id: true,
      name: true,
      slug: true,
      sourceType: true,
      isActive: true,
      url: true,
      refreshIntervalMinutes: true,
    },
  },
  qualityVariants: {
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  },
} satisfies Prisma.ChannelInclude;

const streamChannelSelect = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  sourceMode: true,
  masterHlsUrl: true,
  playbackMode: true,
  upstreamUserAgent: true,
  upstreamReferrer: true,
  upstreamHeaders: true,
  qualityVariants: {
    where: {
      isActive: true,
    },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  },
} satisfies Prisma.ChannelSelect;

const epgLookupChannelSelect = {
  id: true,
  name: true,
  epgChannelId: true,
  epgSource: {
    select: {
      id: true,
      name: true,
      slug: true,
      sourceType: true,
      url: true,
      isActive: true,
      refreshIntervalMinutes: true,
      requestUserAgent: true,
      requestReferrer: true,
      requestHeaders: true,
    },
  },
} satisfies Prisma.ChannelSelect;

export type PublicChannelRecord = Prisma.ChannelGetPayload<{ include: typeof publicChannelInclude }>;
export type ChannelConfigRecord = Prisma.ChannelGetPayload<{ include: typeof channelConfigInclude }>;
export type StreamChannelRecord = Prisma.ChannelGetPayload<{ select: typeof streamChannelSelect }>;
export type EpgLookupChannelRecord = Prisma.ChannelGetPayload<{ select: typeof epgLookupChannelSelect }>;

function mapChannelFilters(searchParams: ChannelQueryParams): Prisma.ChannelWhereInput {
  const where: Prisma.ChannelWhereInput = {};

  if (searchParams.search) {
    where.OR = [
      { name: { contains: searchParams.search, mode: "insensitive" } },
      { slug: { contains: searchParams.search, mode: "insensitive" } },
    ];
  }

  if (searchParams.groupId) {
    where.groupId = searchParams.groupId;
  }

  if (searchParams.active === "true") {
    where.isActive = true;
  }

  if (searchParams.active === "false") {
    where.isActive = false;
  }

  return where;
}

function mapChannelPersistenceInput(data: ChannelInput): Prisma.ChannelUncheckedCreateInput {
  return {
    name: data.name,
    slug: data.slug,
    logoUrl: data.logoUrl,
    sourceMode: data.sourceMode,
    masterHlsUrl: data.sourceMode === "MASTER_PLAYLIST" ? data.masterHlsUrl : null,
    playbackMode: data.playbackMode,
    upstreamUserAgent: data.upstreamUserAgent,
    upstreamReferrer: data.upstreamReferrer,
    upstreamHeaders: Object.keys(data.upstreamHeaders).length ? data.upstreamHeaders : Prisma.DbNull,
    groupId: data.groupId ?? null,
    epgSourceId: data.epgSourceId ?? null,
    epgChannelId: data.epgChannelId ?? null,
    isActive: data.isActive,
    sortOrder: data.sortOrder,
  };
}

function mapQualityVariantPersistenceInput(variant: ChannelQualityVariantInput) {
  return {
    label: variant.label,
    sortOrder: variant.sortOrder,
    playlistUrl: variant.playlistUrl,
    width: variant.width,
    height: variant.height,
    bandwidth: variant.bandwidth,
    codecs: variant.codecs,
    isActive: variant.isActive,
  } satisfies Prisma.ChannelQualityVariantUncheckedCreateWithoutChannelInput;
}

export function listChannels(filters: ChannelQueryParams) {
  return prisma.channel.findMany({
    where: mapChannelFilters(filters),
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: publicChannelInclude,
  });
}

export function findChannelById(id: string) {
  return prisma.channel.findUnique({
    where: { id },
    include: publicChannelInclude,
  });
}

export function findChannelBySlug(slug: string) {
  return prisma.channel.findUnique({
    where: { slug },
    include: publicChannelInclude,
  });
}

export function findChannelConfigById(id: string) {
  return prisma.channel.findUnique({
    where: { id },
    include: channelConfigInclude,
  });
}

export function findChannelStreamById(id: string) {
  return prisma.channel.findUnique({
    where: { id },
    select: streamChannelSelect,
  });
}

export function findChannelsForEpgLookup(ids: string[]) {
  return prisma.channel.findMany({
    where: {
      id: {
        in: ids,
      },
    },
    select: epgLookupChannelSelect,
  });
}

export function createChannel(data: ChannelInput) {
  return prisma.channel.create({
    data: {
      ...mapChannelPersistenceInput(data),
      ...(data.sourceMode === "MANUAL_VARIANTS"
        ? {
            qualityVariants: {
              create: data.manualVariants.map(mapQualityVariantPersistenceInput),
            },
          }
        : {}),
    },
    include: channelConfigInclude,
  });
}

export function updateChannel(id: string, data: ChannelInput) {
  return prisma.channel.update({
    where: { id },
    data: {
      ...mapChannelPersistenceInput(data),
      qualityVariants: {
        deleteMany: {},
        ...(data.sourceMode === "MANUAL_VARIANTS"
          ? {
              create: data.manualVariants.map(mapQualityVariantPersistenceInput),
            }
          : {}),
      },
    },
    include: channelConfigInclude,
  });
}

export function updateChannelSortOrder(id: string, sortOrder: number) {
  return prisma.channel.update({
    where: { id },
    data: {
      sortOrder,
    },
    include: publicChannelInclude,
  });
}

export function deleteChannel(id: string) {
  return prisma.channel.delete({
    where: { id },
  });
}
