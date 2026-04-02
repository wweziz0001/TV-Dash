import { prisma } from "../../db/prisma.js";

export function listFavorites(userId: string) {
  return prisma.favorite.findMany({
    where: { userId },
    include: {
      channel: {
        include: {
          group: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export function upsertFavorite(userId: string, channelId: string) {
  return prisma.favorite.upsert({
    where: {
      userId_channelId: {
        userId,
        channelId,
      },
    },
    update: {},
    create: {
      userId,
      channelId,
    },
    include: {
      channel: {
        include: {
          group: true,
        },
      },
    },
  });
}

export function deleteFavorite(userId: string, channelId: string) {
  return prisma.favorite.deleteMany({
    where: {
      userId,
      channelId,
    },
  });
}
