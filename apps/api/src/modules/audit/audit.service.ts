import type {
  ChannelGroupInput,
  ChannelInput,
  EpgSourceInput,
  LdapProviderConfigInput,
  OidcProviderConfigInput,
  UserRole,
} from "@tv-dash/shared";
import { Prisma } from "@prisma/client";
import { createAuditEvent, listRecentAuditEvents } from "./audit.repository.js";

type AuditDetailValue = string | number | boolean | null | undefined;
type AuditDetail = Record<string, AuditDetailValue>;

interface RecordAuditEventInput {
  actorUserId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetName?: string | null;
  detail?: AuditDetail | null;
}

function toAuditJson(detail?: AuditDetail | null) {
  if (!detail || Object.keys(detail).length === 0) {
    return Prisma.JsonNull;
  }

  return detail;
}

export async function recordAuditEvent(input: RecordAuditEventInput) {
  return createAuditEvent({
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    targetName: input.targetName ?? null,
    detailJson: toAuditJson(input.detail),
  });
}

export async function listAuditEvents(filters: {
  actorUserId?: string;
  targetType?: string;
  action?: string;
  search?: string;
  limit?: number;
}) {
  const events = await listRecentAuditEvents(filters);

  return events.map((event) => ({
    id: event.id,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    targetName: event.targetName,
    actorUserId: event.actorUserId,
    actorRole: event.actorRole,
    actorUser: event.actorUser
      ? {
          id: event.actorUser.id,
          username: event.actorUser.username,
          role: event.actorUser.role,
        }
      : null,
    detail: isPlainAuditDetail(event.detailJson) ? event.detailJson : null,
    createdAt: event.createdAt.toISOString(),
  }));
}

function isPlainAuditDetail(value: Prisma.JsonValue | null): value is AuditDetail {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function summarizeChannelAuditDetail(channel: ChannelInput) {
  return {
    sourceMode: channel.sourceMode,
    playbackMode: channel.playbackMode,
    timeshiftEnabled: channel.timeshiftEnabled,
    timeshiftWindowMinutes: channel.timeshiftEnabled ? channel.timeshiftWindowMinutes : null,
    isActive: channel.isActive,
    sortOrder: channel.sortOrder,
    manualVariantCount: channel.sourceMode === "MANUAL_VARIANTS" ? channel.manualVariants.length : 0,
    hasLogoUrl: Boolean(channel.logoUrl),
    hasGroup: Boolean(channel.groupId),
    hasUserAgent: Boolean(channel.upstreamUserAgent),
    hasReferrer: Boolean(channel.upstreamReferrer),
    upstreamHeaderCount: Object.keys(channel.upstreamHeaders).length,
  } satisfies AuditDetail;
}

export function summarizeGroupAuditDetail(group: ChannelGroupInput) {
  return {
    sortOrder: group.sortOrder,
    slug: group.slug,
    name: group.name,
  } satisfies AuditDetail;
}

export function summarizeEpgSourceAuditDetail(source: EpgSourceInput) {
  return {
    sourceType: source.sourceType,
    isActive: source.isActive,
    refreshIntervalMinutes: source.refreshIntervalMinutes,
    hasUserAgent: Boolean(source.requestUserAgent),
    hasReferrer: Boolean(source.requestReferrer),
    requestHeaderCount: Object.keys(source.requestHeaders).length,
  } satisfies AuditDetail;
}

export function summarizeLdapAuthProviderAuditDetail(config: LdapProviderConfigInput) {
  return {
    isEnabled: config.isEnabled,
    isVisibleOnLogin: config.isVisibleOnLogin,
    allowAutoProvision: config.allowAutoProvision,
    autoLinkByEmail: config.autoLinkByEmail,
    autoLinkByUsername: config.autoLinkByUsername,
    defaultRole: config.defaultRole,
    hasBindDn: Boolean(config.bindDn),
    hasBindPassword: Boolean(config.bindPassword),
    clearBindPassword: config.clearBindPassword,
    userSearchScope: config.userSearchScope,
    startTls: config.startTls,
    rejectUnauthorized: config.rejectUnauthorized,
  } satisfies AuditDetail;
}

export function summarizeOidcAuthProviderAuditDetail(config: OidcProviderConfigInput) {
  return {
    isEnabled: config.isEnabled,
    isVisibleOnLogin: config.isVisibleOnLogin,
    allowAutoProvision: config.allowAutoProvision,
    autoLinkByEmail: config.autoLinkByEmail,
    autoLinkByUsername: config.autoLinkByUsername,
    defaultRole: config.defaultRole,
    clientId: config.clientId,
    hasClientSecret: Boolean(config.clientSecret),
    clearClientSecret: config.clearClientSecret,
    scopes: config.scopes,
    requireVerifiedEmail: config.requireVerifiedEmail,
  } satisfies AuditDetail;
}
