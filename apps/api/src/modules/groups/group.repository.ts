import type { Prisma } from "@prisma/client";
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

export function createGroup(data: Prisma.ChannelGroupUncheckedCreateInput) {
  return prisma.channelGroup.create({
    data,
  });
}

export function updateGroup(id: string, data: Prisma.ChannelGroupUncheckedUpdateInput) {
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
