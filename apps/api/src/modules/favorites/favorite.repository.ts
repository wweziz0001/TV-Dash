import { prisma } from "../../db/prisma.js";
import { publicChannelInclude } from "../channels/channel.repository.js";

export function listFavorites(userId: string) {
  return prisma.favorite.findMany({
    where: { userId },
    include: {
      channel: {
        include: publicChannelInclude,
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
        include: publicChannelInclude,
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
