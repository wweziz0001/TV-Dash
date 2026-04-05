import type {
  OperationalAlertCategory,
  OperationalAlertSeverity,
  OperationalAlertStatus,
} from "@tv-dash/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export interface ListOperationalAlertsFilters {
  view?: "ACTIVE" | "HISTORY" | "ALL";
  statuses?: OperationalAlertStatus[];
  categories?: OperationalAlertCategory[];
  severities?: OperationalAlertSeverity[];
  sourceSubsystem?: string;
  search?: string;
  limit?: number;
}

function buildOperationalAlertWhereInput(filters: ListOperationalAlertsFilters = {}): Prisma.OperationalAlertWhereInput {
  const where: Prisma.OperationalAlertWhereInput = {};

  if (filters.view === "ACTIVE") {
    where.isActive = true;
  } else if (filters.view === "HISTORY") {
    where.isActive = false;
  }

  if (filters.statuses?.length) {
    where.status = {
      in: filters.statuses,
    };
  }

  if (filters.categories?.length) {
    where.category = {
      in: filters.categories,
    };
  }

  if (filters.severities?.length) {
    where.severity = {
      in: filters.severities,
    };
  }

  if (filters.sourceSubsystem) {
    where.sourceSubsystem = filters.sourceSubsystem;
  }

  if (filters.search) {
    where.OR = [
      {
        title: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
      {
        message: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
      {
        sourceSubsystem: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
      {
        dedupeKey: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
      {
        relatedEntityId: {
          contains: filters.search,
          mode: "insensitive",
        },
      },
    ];
  }

  return where;
}

export function listOperationalAlerts(filters: ListOperationalAlertsFilters = {}) {
  return prisma.operationalAlert.findMany({
    where: buildOperationalAlertWhereInput(filters),
    orderBy: [{ lastOccurredAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(filters.limit ?? 200, 1), 500),
  });
}

export function findOperationalAlertById(id: string) {
  return prisma.operationalAlert.findUnique({
    where: { id },
  });
}

export function findActiveOperationalAlertByDedupeKey(dedupeKey: string) {
  return prisma.operationalAlert.findFirst({
    where: {
      dedupeKey,
      isActive: true,
    },
    orderBy: [{ lastOccurredAt: "desc" }],
  });
}

export function createOperationalAlert(data: Prisma.OperationalAlertUncheckedCreateInput) {
  return prisma.operationalAlert.create({
    data,
  });
}

export function updateOperationalAlert(id: string, data: Prisma.OperationalAlertUncheckedUpdateInput) {
  return prisma.operationalAlert.update({
    where: { id },
    data,
  });
}

export function countOperationalAlerts(where: Prisma.OperationalAlertWhereInput) {
  return prisma.operationalAlert.count({ where });
}
