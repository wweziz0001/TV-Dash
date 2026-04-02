import type { ChannelGroupInput } from "@tv-dash/shared";
import { prisma } from "../../db/prisma.js";

export function listGroups() {
  return prisma.channelGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          channels: true,
        },
      },
    },
  });
}

export function createGroup(data: ChannelGroupInput) {
  return prisma.channelGroup.create({
    data,
  });
}

export function updateGroup(id: string, data: ChannelGroupInput) {
  return prisma.channelGroup.update({
    where: { id },
    data,
  });
}

export function deleteGroup(id: string) {
  return prisma.channelGroup.delete({
    where: { id },
  });
}
