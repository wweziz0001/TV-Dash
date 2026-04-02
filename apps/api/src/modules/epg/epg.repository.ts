import type { EpgSourceInput } from "@tv-dash/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

function mapEpgSourceInput(data: EpgSourceInput) {
  return {
    name: data.name,
    slug: data.slug,
    sourceType: data.sourceType,
    url: data.url,
    isActive: data.isActive,
    refreshIntervalMinutes: data.refreshIntervalMinutes,
    requestUserAgent: data.requestUserAgent,
    requestReferrer: data.requestReferrer,
    requestHeaders: Object.keys(data.requestHeaders).length ? data.requestHeaders : Prisma.DbNull,
  };
}

export function listEpgSources() {
  return prisma.epgSource.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          channels: true,
        },
      },
    },
  });
}

export function findEpgSourceById(id: string) {
  return prisma.epgSource.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          channels: true,
        },
      },
    },
  });
}

export function createEpgSource(data: EpgSourceInput) {
  return prisma.epgSource.create({
    data: mapEpgSourceInput(data),
    include: {
      _count: {
        select: {
          channels: true,
        },
      },
    },
  });
}

export function updateEpgSource(id: string, data: EpgSourceInput) {
  return prisma.epgSource.update({
    where: { id },
    data: mapEpgSourceInput(data),
    include: {
      _count: {
        select: {
          channels: true,
        },
      },
    },
  });
}

export function deleteEpgSource(id: string) {
  return prisma.epgSource.delete({
    where: { id },
  });
}
