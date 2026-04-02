import type { ChannelInput } from "@tv-dash/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

interface ChannelQueryParams {
  search?: string;
  groupId?: string;
  active?: string;
}

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

export function listChannels(filters: ChannelQueryParams) {
  return prisma.channel.findMany({
    where: mapChannelFilters(filters),
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      group: true,
    },
  });
}

export function findChannelById(id: string) {
  return prisma.channel.findUnique({
    where: { id },
    include: { group: true },
  });
}

export function findChannelBySlug(slug: string) {
  return prisma.channel.findUnique({
    where: { slug },
    include: { group: true },
  });
}

export function createChannel(data: ChannelInput) {
  return prisma.channel.create({
    data,
    include: { group: true },
  });
}

export function updateChannel(id: string, data: ChannelInput) {
  return prisma.channel.update({
    where: { id },
    data,
    include: { group: true },
  });
}

export function deleteChannel(id: string) {
  return prisma.channel.delete({
    where: { id },
  });
}
