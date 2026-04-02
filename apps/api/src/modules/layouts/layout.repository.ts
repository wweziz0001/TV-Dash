import type { SavedLayoutInput } from "@tv-dash/shared";
import { prisma } from "../../db/prisma.js";

function mapLayoutItems(items: SavedLayoutInput["items"]) {
  return items.map((item) => ({
    tileIndex: item.tileIndex,
    channelId: item.channelId,
    preferredQuality: item.preferredQuality,
    isMuted: item.isMuted,
  }));
}

export function listLayouts(userId: string) {
  return prisma.savedLayout.findMany({
    where: { userId },
    include: {
      items: {
        include: {
          channel: {
            include: {
              group: true,
            },
          },
        },
        orderBy: {
          tileIndex: "asc",
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

export function findOwnedLayout(id: string, userId: string) {
  return prisma.savedLayout.findFirst({
    where: {
      id,
      userId,
    },
    select: {
      id: true,
    },
  });
}

export function createLayout(userId: string, payload: SavedLayoutInput) {
  return prisma.savedLayout.create({
    data: {
      userId,
      name: payload.name,
      layoutType: payload.layoutType,
      configJson: payload.configJson,
      items: {
        create: mapLayoutItems(payload.items),
      },
    },
    include: {
      items: {
        include: {
          channel: true,
        },
        orderBy: {
          tileIndex: "asc",
        },
      },
    },
  });
}

export function updateLayout(id: string, payload: SavedLayoutInput) {
  return prisma.savedLayout.update({
    where: { id },
    data: {
      name: payload.name,
      layoutType: payload.layoutType,
      configJson: payload.configJson,
      items: {
        deleteMany: {},
        create: mapLayoutItems(payload.items),
      },
    },
    include: {
      items: {
        include: {
          channel: true,
        },
        orderBy: {
          tileIndex: "asc",
        },
      },
    },
  });
}

export function deleteLayout(id: string) {
  return prisma.savedLayout.delete({
    where: { id },
  });
}
