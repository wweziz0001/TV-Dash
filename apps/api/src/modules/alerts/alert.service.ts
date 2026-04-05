import type {
  JsonValue,
  OperationalAlertCategory,
  OperationalAlertEntityType,
  OperationalAlertSeverity,
  OperationalAlertStatus,
  OperationalAlertType,
} from "@tv-dash/shared";
import { Prisma, type OperationalAlert } from "@prisma/client";
import {
  countOperationalAlerts,
  createOperationalAlert,
  findActiveOperationalAlertByDedupeKey,
  findOperationalAlertById,
  listOperationalAlerts as listOperationalAlertRecords,
  updateOperationalAlert,
  type ListOperationalAlertsFilters,
} from "./alert.repository.js";

type OperationalAlertMetadata = Record<string, JsonValue>;

interface CreateOperationalAlertInput {
  type: OperationalAlertType;
  category: OperationalAlertCategory;
  severity: OperationalAlertSeverity;
  sourceSubsystem: string;
  title: string;
  message: string;
  relatedEntityType?: OperationalAlertEntityType | null;
  relatedEntityId?: string | null;
  metadata?: OperationalAlertMetadata | null;
  occurredAt?: Date;
}

interface CreateActiveOperationalAlertInput extends CreateOperationalAlertInput {
  dedupeKey: string;
}

interface ResolveOperationalAlertByDedupeKeyInput {
  dedupeKey: string;
  resolvedAt?: Date;
  resolvedByUserId?: string | null;
  resolutionNotification?: CreateOperationalAlertInput | null;
}

function toAlertMetadataJson(metadata?: OperationalAlertMetadata | null) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return Prisma.JsonNull;
  }

  return metadata;
}

function isPlainAlertMetadata(value: Prisma.JsonValue | null): value is OperationalAlertMetadata {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapSeverityLabel(severity: OperationalAlertSeverity) {
  return severity.replace(/_/g, " ").toLowerCase();
}

function buildRelatedEntityPath(params: {
  relatedEntityType: OperationalAlertEntityType | null;
  relatedEntityId: string | null;
  metadata: OperationalAlertMetadata | null;
}) {
  if (params.relatedEntityType === "CHANNEL") {
    const channelSlug = typeof params.metadata?.channelSlug === "string" ? params.metadata.channelSlug : null;
    return channelSlug ? `/watch/${channelSlug}` : "/admin/channels";
  }

  if (params.relatedEntityType === "RECORDING_JOB" && params.relatedEntityId) {
    return `/recordings/${params.relatedEntityId}`;
  }

  if (params.relatedEntityType === "EPG_SOURCE") {
    return "/admin/epg";
  }

  if (params.relatedEntityType === "PLAYBACK_CLUSTER") {
    return "/admin/observability";
  }

  return null;
}

function buildRelatedEntityLabel(params: {
  relatedEntityType: OperationalAlertEntityType | null;
  relatedEntityId: string | null;
  metadata: OperationalAlertMetadata | null;
}) {
  if (params.relatedEntityType === "CHANNEL") {
    return typeof params.metadata?.channelName === "string"
      ? params.metadata.channelName
      : typeof params.metadata?.channelSlug === "string"
        ? params.metadata.channelSlug
        : params.relatedEntityId;
  }

  if (params.relatedEntityType === "RECORDING_JOB") {
    return typeof params.metadata?.recordingTitle === "string"
      ? params.metadata.recordingTitle
      : params.relatedEntityId;
  }

  if (params.relatedEntityType === "EPG_SOURCE") {
    return typeof params.metadata?.sourceName === "string"
      ? params.metadata.sourceName
      : typeof params.metadata?.sourceSlug === "string"
        ? params.metadata.sourceSlug
        : params.relatedEntityId;
  }

  if (params.relatedEntityType === "PLAYBACK_CLUSTER") {
    return typeof params.metadata?.channelName === "string"
      ? params.metadata.channelName
      : params.relatedEntityId;
  }

  return params.relatedEntityId;
}

function mapOperationalAlert(record: OperationalAlert | null) {
  if (!record) {
    return null;
  }

  const metadata = isPlainAlertMetadata(record.metadataJson) ? record.metadataJson : null;

  return {
    id: record.id,
    type: record.type,
    category: record.category,
    severity: record.severity,
    severityLabel: mapSeverityLabel(record.severity),
    status: record.status,
    sourceSubsystem: record.sourceSubsystem,
    title: record.title,
    message: record.message,
    isActive: record.isActive,
    dedupeKey: record.dedupeKey ?? null,
    occurrenceCount: record.occurrenceCount,
    relatedEntityType: record.relatedEntityType ?? null,
    relatedEntityId: record.relatedEntityId ?? null,
    relatedEntityLabel: buildRelatedEntityLabel({
      relatedEntityType: record.relatedEntityType ?? null,
      relatedEntityId: record.relatedEntityId ?? null,
      metadata,
    }),
    relatedEntityPath: buildRelatedEntityPath({
      relatedEntityType: record.relatedEntityType ?? null,
      relatedEntityId: record.relatedEntityId ?? null,
      metadata,
    }),
    metadata,
    firstOccurredAt: record.firstOccurredAt.toISOString(),
    lastOccurredAt: record.lastOccurredAt.toISOString(),
    acknowledgedAt: record.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByUserId: record.acknowledgedByUserId ?? null,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: record.resolvedByUserId ?? null,
    dismissedAt: record.dismissedAt?.toISOString() ?? null,
    dismissedByUserId: record.dismissedByUserId ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function getOperationalAlertSummary() {
  const [
    totalCount,
    newCount,
    activeCount,
    acknowledgedCount,
    criticalCount,
    errorCount,
    resolvedCount,
    dismissedCount,
  ] = await Promise.all([
    countOperationalAlerts({}),
    countOperationalAlerts({ status: "NEW" }),
    countOperationalAlerts({ isActive: true }),
    countOperationalAlerts({ status: "ACKNOWLEDGED" }),
    countOperationalAlerts({ isActive: true, severity: "CRITICAL" }),
    countOperationalAlerts({ isActive: true, severity: { in: ["ERROR", "CRITICAL"] } }),
    countOperationalAlerts({ status: "RESOLVED" }),
    countOperationalAlerts({ status: "DISMISSED" }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    totalCount,
    newCount,
    activeCount,
    acknowledgedCount,
    criticalCount,
    errorCount,
    resolvedCount,
    dismissedCount,
  };
}

export async function listOperationalAlerts(filters: ListOperationalAlertsFilters = {}) {
  const records = await listOperationalAlertRecords(filters);

  return records
    .map((record) => mapOperationalAlert(record))
    .filter((record): record is NonNullable<typeof record> => Boolean(record));
}

export async function createOperationalNotification(input: CreateOperationalAlertInput) {
  const occurredAt = input.occurredAt ?? new Date();
  const record = await createOperationalAlert({
    type: input.type,
    category: input.category,
    severity: input.severity,
    status: "NEW",
    sourceSubsystem: input.sourceSubsystem,
    title: input.title,
    message: input.message,
    isActive: false,
    dedupeKey: null,
    occurrenceCount: 1,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    metadataJson: toAlertMetadataJson(input.metadata),
    firstOccurredAt: occurredAt,
    lastOccurredAt: occurredAt,
  });

  return mapOperationalAlert(record);
}

export async function createOrUpdateActiveOperationalAlert(input: CreateActiveOperationalAlertInput) {
  const occurredAt = input.occurredAt ?? new Date();
  const existing = await findActiveOperationalAlertByDedupeKey(input.dedupeKey);

  if (existing) {
    const record = await updateOperationalAlert(existing.id, {
      type: input.type,
      category: input.category,
      severity: input.severity,
      sourceSubsystem: input.sourceSubsystem,
      title: input.title,
      message: input.message,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      metadataJson: toAlertMetadataJson(input.metadata),
      occurrenceCount: {
        increment: 1,
      },
      lastOccurredAt: occurredAt,
    });

    return mapOperationalAlert(record);
  }

  const record = await createOperationalAlert({
    type: input.type,
    category: input.category,
    severity: input.severity,
    status: "NEW",
    sourceSubsystem: input.sourceSubsystem,
    title: input.title,
    message: input.message,
    isActive: true,
    dedupeKey: input.dedupeKey,
    occurrenceCount: 1,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    metadataJson: toAlertMetadataJson(input.metadata),
    firstOccurredAt: occurredAt,
    lastOccurredAt: occurredAt,
  });

  return mapOperationalAlert(record);
}

export async function resolveOperationalAlertByDedupeKey(input: ResolveOperationalAlertByDedupeKeyInput) {
  const existing = await findActiveOperationalAlertByDedupeKey(input.dedupeKey);

  if (!existing) {
    return {
      resolvedAlert: null,
      resolutionNotification: null,
    };
  }

  const resolvedAt = input.resolvedAt ?? new Date();
  const resolvedRecord = await updateOperationalAlert(existing.id, {
    status: "RESOLVED",
    isActive: false,
    resolvedAt,
    resolvedByUserId: input.resolvedByUserId ?? null,
  });

  const resolutionNotification = input.resolutionNotification
    ? await createOperationalNotification({
        ...input.resolutionNotification,
        occurredAt: resolvedAt,
        metadata: {
          ...(input.resolutionNotification.metadata ?? {}),
          resolvedAlertId: resolvedRecord.id,
        },
      })
    : null;

  return {
    resolvedAlert: mapOperationalAlert(resolvedRecord),
    resolutionNotification,
  };
}

async function updateOperationalAlertStatus(params: {
  id: string;
  status: OperationalAlertStatus;
  actorUserId?: string | null;
  changedAt?: Date;
}) {
  const record = await findOperationalAlertById(params.id);

  if (!record) {
    return null;
  }

  const changedAt = params.changedAt ?? new Date();

  if (params.status === "ACKNOWLEDGED") {
    if (!record.isActive || record.status === "ACKNOWLEDGED") {
      return mapOperationalAlert(record);
    }

    return mapOperationalAlert(
      await updateOperationalAlert(record.id, {
        status: "ACKNOWLEDGED",
        acknowledgedAt: changedAt,
        acknowledgedByUserId: params.actorUserId ?? null,
      }),
    );
  }

  if (params.status === "RESOLVED") {
    if (!record.isActive && record.status === "RESOLVED") {
      return mapOperationalAlert(record);
    }

    return mapOperationalAlert(
      await updateOperationalAlert(record.id, {
        status: "RESOLVED",
        isActive: false,
        resolvedAt: changedAt,
        resolvedByUserId: params.actorUserId ?? null,
      }),
    );
  }

  if (params.status === "DISMISSED") {
    if (!record.isActive && record.status === "DISMISSED") {
      return mapOperationalAlert(record);
    }

    return mapOperationalAlert(
      await updateOperationalAlert(record.id, {
        status: "DISMISSED",
        isActive: false,
        dismissedAt: changedAt,
        dismissedByUserId: params.actorUserId ?? null,
      }),
    );
  }

  return mapOperationalAlert(record);
}

export function acknowledgeOperationalAlert(id: string, actorUserId?: string | null) {
  return updateOperationalAlertStatus({
    id,
    status: "ACKNOWLEDGED",
    actorUserId,
  });
}

export function resolveOperationalAlert(id: string, actorUserId?: string | null) {
  return updateOperationalAlertStatus({
    id,
    status: "RESOLVED",
    actorUserId,
  });
}

export function dismissOperationalAlert(id: string, actorUserId?: string | null) {
  return updateOperationalAlertStatus({
    id,
    status: "DISMISSED",
    actorUserId,
  });
}
