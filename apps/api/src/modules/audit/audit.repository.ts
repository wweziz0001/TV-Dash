import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

interface AuditEventFilters {
  actorUserId?: string;
  targetType?: string;
  action?: string;
  search?: string;
  limit?: number;
}

const auditActorSelect = {
  id: true,
  username: true,
  role: true,
} satisfies Prisma.UserSelect;

function buildAuditWhere(filters: AuditEventFilters): Prisma.AuditEventWhereInput {
  const where: Prisma.AuditEventWhereInput = {};

  if (filters.actorUserId) {
    where.actorUserId = filters.actorUserId;
  }

  if (filters.targetType) {
    where.targetType = filters.targetType;
  }

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.search) {
    where.OR = [
      {
        action: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
      {
        targetType: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
      {
        targetName: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
      {
        targetId: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
    ];
  }

  return where;
}

export function createAuditEvent(data: Prisma.AuditEventUncheckedCreateInput) {
  return prisma.auditEvent.create({
    data,
  });
}

export function listRecentAuditEvents(filters: AuditEventFilters) {
  return prisma.auditEvent.findMany({
    where: buildAuditWhere(filters),
    orderBy: {
      createdAt: "desc",
    },
    take: Math.min(Math.max(filters.limit ?? 50, 1), 200),
    include: {
      actorUser: {
        select: auditActorSelect,
      },
    },
  });
}
