import { createHash } from "node:crypto";
import { isSharedPlaybackMode, type ChannelSourceMode } from "@tv-dash/shared";
import { writeStructuredLog, sanitizeUrl } from "../../app/structured-log.js";
import { buildUpstreamHeaders, type UpstreamRequestConfig } from "../../app/upstream-request.js";
import { env } from "../../config/env.js";
import { getChannelStreamDetails } from "../channels/channel.service.js";
import { recordChannelObservation } from "../diagnostics/diagnostic.service.js";
import { parseMasterPlaylist } from "./playlist-parser.js";
import { isPlaylistResponse, rewritePlaylist } from "./playlist-rewrite.js";
import { classifyStreamFailure } from "./stream-diagnostics.js";
import { buildSyntheticMasterPlaylist } from "./synthetic-master.js";
import { createSharedSessionCache } from "./shared-session-cache.js";

const FETCH_TIMEOUT_MS = 6000;

export type SharedSessionObservationSource = "SHARED_MASTER" | "SHARED_ASSET" | "SHARED_TIMESHIFT";
type SharedUpstreamState = "STARTING" | "ACTIVE" | "ERROR";

export interface SharedStreamSessionSnapshot {
  channelId: string;
  channelSlug: string;
  sourceMode: ChannelSourceMode;
  upstreamState: SharedUpstreamState;
  createdAt: string;
  lastAccessAt: string;
  expiresAt: string;
  lastUpstreamRequestAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  mappedAssetCount: number;
  cache: ReturnType<ReturnType<typeof createSharedSessionCache>["getSnapshot"]>;
}

export interface SharedStreamStatus {
  channelId: string;
  configured: boolean;
  enabled: boolean;
  active: boolean;
  upstreamState: "DISABLED" | "IDLE" | SharedUpstreamState;
  message: string;
  lastAccessAt: string | null;
  expiresAt: string | null;
  lastUpstreamRequestAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  mappedAssetCount: number;
  cache: ReturnType<ReturnType<typeof createSharedSessionCache>["getSnapshot"]> | null;
}

interface SharedStreamSessionState {
  channelId: string;
  channelSlug: string;
  sourceMode: ChannelSourceMode;
  requestConfig: UpstreamRequestConfig;
  createdAtMs: number;
  lastAccessAtMs: number;
  lastUpstreamRequestAtMs: number | null;
  lastError: string | null;
  lastErrorAtMs: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  assetIdsByUrl: Map<string, string>;
  urlsByAssetId: Map<string, string>;
  cache: ReturnType<typeof createSharedSessionCache>;
}

export interface SharedStreamUpstreamResponse {
  body: string | Buffer;
  contentType: string;
  cacheKind: "manifest" | "segment";
}

const sharedStreamSessions = new Map<string, SharedStreamSessionState>();

function toIsoString(value: number | null) {
  return typeof value === "number" ? new Date(value).toISOString() : null;
}

function mapChannelRequestConfig(channel: NonNullable<Awaited<ReturnType<typeof getChannelStreamDetails>>>) {
  return {
    requestUserAgent: channel.upstreamUserAgent,
    requestReferrer: channel.upstreamReferrer,
    requestHeaders: channel.upstreamHeaders as Record<string, string> | null,
  } satisfies UpstreamRequestConfig;
}

function buildSharedAssetPath(channelId: string, assetId: string) {
  return `/api/streams/channels/${channelId}/shared/assets/${assetId}`;
}

function createSharedAssetId(absoluteUrl: string) {
  return createHash("sha1").update(absoluteUrl).digest("hex");
}

function getSharedUpstreamState(session: SharedStreamSessionState): SharedUpstreamState {
  if (session.lastError) {
    return "ERROR";
  }

  return session.lastUpstreamRequestAtMs === null ? "STARTING" : "ACTIVE";
}

function buildSharedSessionSnapshot(session: SharedStreamSessionState): SharedStreamSessionSnapshot {
  return {
    channelId: session.channelId,
    channelSlug: session.channelSlug,
    sourceMode: session.sourceMode,
    upstreamState: getSharedUpstreamState(session),
    createdAt: new Date(session.createdAtMs).toISOString(),
    lastAccessAt: new Date(session.lastAccessAtMs).toISOString(),
    expiresAt: new Date(session.lastAccessAtMs + env.SHARED_STREAM_IDLE_TTL_MS).toISOString(),
    lastUpstreamRequestAt: toIsoString(session.lastUpstreamRequestAtMs),
    lastError: session.lastError,
    lastErrorAt: toIsoString(session.lastErrorAtMs),
    mappedAssetCount: session.urlsByAssetId.size,
    cache: session.cache.getSnapshot(),
  };
}

function evictSharedSession(channelId: string, reason: "cleanup" | "expired") {
  const session = sharedStreamSessions.get(channelId);
  if (!session) {
    return;
  }

  if (session.timer) {
    clearTimeout(session.timer);
  }

  session.cache.clear();
  session.assetIdsByUrl.clear();
  session.urlsByAssetId.clear();
  sharedStreamSessions.delete(channelId);

  writeStructuredLog("info", {
    event: "stream.shared.session.expired",
    channelId: session.channelId,
    channelSlug: session.channelSlug,
    detail: {
      reason,
    },
  });
}

function scheduleSharedSessionExpiry(session: SharedStreamSessionState) {
  if (session.timer) {
    clearTimeout(session.timer);
  }

  session.timer = setTimeout(() => {
    const nowMs = Date.now();

    if (nowMs - session.lastAccessAtMs >= env.SHARED_STREAM_IDLE_TTL_MS) {
      evictSharedSession(session.channelId, "expired");
      return;
    }

    scheduleSharedSessionExpiry(session);
  }, env.SHARED_STREAM_IDLE_TTL_MS);
}

function touchSharedSession(session: SharedStreamSessionState) {
  session.lastAccessAtMs = Date.now();
  scheduleSharedSessionExpiry(session);
}

function getOrCreateAssetId(session: SharedStreamSessionState, absoluteUrl: string) {
  const existing = session.assetIdsByUrl.get(absoluteUrl);
  if (existing) {
    return existing;
  }

  const baseAssetId = createSharedAssetId(absoluteUrl);
  let assetId = baseAssetId;
  let collisionIndex = 1;

  while (session.urlsByAssetId.has(assetId) && session.urlsByAssetId.get(assetId) !== absoluteUrl) {
    assetId = `${baseAssetId}-${collisionIndex}`;
    collisionIndex += 1;
  }

  session.assetIdsByUrl.set(absoluteUrl, assetId);
  session.urlsByAssetId.set(assetId, absoluteUrl);
  return assetId;
}

async function fetchUpstream(url: string, requestConfig: UpstreamRequestConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: buildUpstreamHeaders(requestConfig),
    });

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function createSharedSession(channelId: string) {
  const channel = await getChannelStreamDetails(channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  if (!env.SHARED_STREAM_ENABLED) {
    throw new Error("Shared stream delivery is disabled.");
  }

  if (!isSharedPlaybackMode(channel.playbackMode)) {
    throw new Error("Shared stream delivery is not enabled for this channel.");
  }

  const nowMs = Date.now();
  const session: SharedStreamSessionState = {
    channelId: channel.id,
    channelSlug: channel.slug,
    sourceMode: channel.sourceMode,
    requestConfig: mapChannelRequestConfig(channel),
    createdAtMs: nowMs,
    lastAccessAtMs: nowMs,
    lastUpstreamRequestAtMs: null,
    lastError: null,
    lastErrorAtMs: null,
    timer: null,
    assetIdsByUrl: new Map(),
    urlsByAssetId: new Map(),
    cache: createSharedSessionCache(),
  };

  sharedStreamSessions.set(channel.id, session);
  scheduleSharedSessionExpiry(session);

  writeStructuredLog("info", {
    event: "stream.shared.session.started",
    channelId: channel.id,
    channelSlug: channel.slug,
    detail: {
      sourceMode: channel.sourceMode,
    },
  });

  return session;
}

async function ensureSharedSession(channelId: string) {
  const existing = sharedStreamSessions.get(channelId);
  if (existing) {
    touchSharedSession(existing);
    return existing;
  }

  return createSharedSession(channelId);
}

async function resolveSharedUpstreamResponse(
  session: SharedStreamSessionState,
  absoluteUrl: string,
  observationSource: SharedSessionObservationSource,
) {
  const cacheKind = isPlaylistResponse(null, absoluteUrl) ? "manifest" : "segment";
  const cached = session.cache.get(absoluteUrl, cacheKind);

  if (cached) {
    touchSharedSession(session);
    return cached;
  }

  const payload = await session.cache.load(absoluteUrl, async () => {
    try {
      session.lastUpstreamRequestAtMs = Date.now();
      const response = await fetchUpstream(absoluteUrl, session.requestConfig);
      const contentType = response.headers.get("content-type");

      if (isPlaylistResponse(contentType, absoluteUrl)) {
        const playlist = await response.text();
        parseMasterPlaylist(playlist);

        const rewrittenPlaylist = rewritePlaylist(playlist, absoluteUrl, (nextAbsoluteUrl) => {
          const assetId = getOrCreateAssetId(session, nextAbsoluteUrl);
          return buildSharedAssetPath(session.channelId, assetId);
        });
        const sharedPayload = {
          body: rewrittenPlaylist,
          contentType: contentType ?? "application/vnd.apple.mpegurl",
          cacheKind: "manifest" as const,
        };

        recordChannelObservation(
          session.channelId,
          observationSource === "SHARED_MASTER" ? "proxyMaster" : "proxyAsset",
          {
          status: "success",
          source: observationSource,
          detail: {
            cacheKind: sharedPayload.cacheKind,
            contentType: sharedPayload.contentType,
            targetUrl: sanitizeUrl(absoluteUrl),
          },
          },
        );

        session.lastError = null;
        session.lastErrorAtMs = null;
        return sharedPayload;
      }

      const sharedPayload = {
        body: Buffer.from(await response.arrayBuffer()),
        contentType: contentType ?? "application/octet-stream",
        cacheKind: "segment" as const,
      };

      recordChannelObservation(
        session.channelId,
        observationSource === "SHARED_MASTER" ? "proxyMaster" : "proxyAsset",
        {
        status: "success",
        source: observationSource,
        detail: {
          cacheKind: sharedPayload.cacheKind,
          contentType: sharedPayload.contentType,
          targetUrl: sanitizeUrl(absoluteUrl),
        },
        },
      );

      session.lastError = null;
      session.lastErrorAtMs = null;
      return sharedPayload;
    } catch (error) {
      const classification = classifyStreamFailure(error, {
        operation: observationSource === "SHARED_MASTER" ? "proxy-master" : "proxy-asset",
      });

      session.lastError = classification.message;
      session.lastErrorAtMs = Date.now();

      recordChannelObservation(
        session.channelId,
        observationSource === "SHARED_MASTER" ? "proxyMaster" : "proxyAsset",
        {
        status: "failure",
        source: observationSource,
        reason: classification.message,
        failureKind: classification.failureKind,
        retryable: classification.retryable,
        detail: {
          statusCode: classification.statusCode,
          targetUrl: sanitizeUrl(absoluteUrl),
        },
        },
      );

      writeStructuredLog("warn", {
        event:
          observationSource === "SHARED_MASTER"
            ? "stream.shared.master.failed"
            : observationSource === "SHARED_TIMESHIFT"
              ? "stream.shared.timeshift.failed"
              : "stream.shared.asset.failed",
        channelId: session.channelId,
        channelSlug: session.channelSlug,
        failureKind: classification.failureKind,
        retryable: classification.retryable,
        statusCode: classification.statusCode,
        detail: {
          targetUrl: sanitizeUrl(absoluteUrl),
        },
      });

      throw error;
    }
  });

  touchSharedSession(session);
  return session.cache.set(absoluteUrl, payload);
}

export async function getChannelSharedMasterResponse(channelId: string) {
  const session = await ensureSharedSession(channelId);

  if (session.sourceMode === "MANUAL_VARIANTS") {
    const channel = await getChannelStreamDetails(channelId);

    if (!channel) {
      throw new Error("Channel not found");
    }

    const body = buildSyntheticMasterPlaylist(channel.qualityVariants, {
      rewriteUri: (absoluteUrl) => {
        const assetId = getOrCreateAssetId(session, absoluteUrl);
        return buildSharedAssetPath(channel.id, assetId);
      },
    });

    recordChannelObservation(channel.id, "proxyMaster", {
      status: "success",
      source: "SHARED_MASTER",
      detail: {
        contentType: "application/vnd.apple.mpegurl",
        targetUrl: "synthetic-master",
      },
    });

    touchSharedSession(session);
    return {
      body,
      contentType: "application/vnd.apple.mpegurl",
    };
  }

  const channel = await getChannelStreamDetails(channelId);
  if (!channel?.masterHlsUrl) {
    throw new Error("Channel master playlist is not configured");
  }

  const entry = await resolveSharedUpstreamResponse(session, channel.masterHlsUrl, "SHARED_MASTER");
  return {
    body: entry.body,
    contentType: entry.contentType,
  };
}

export async function getChannelSharedAssetResponse(channelId: string, assetId: string) {
  const session = await ensureSharedSession(channelId);
  const absoluteUrl = session.urlsByAssetId.get(assetId);

  if (!absoluteUrl) {
    throw new Error("Shared asset not found");
  }

  const entry = await resolveSharedUpstreamResponse(session, absoluteUrl, "SHARED_ASSET");
  return {
    body: entry.body,
    contentType: entry.contentType,
  };
}

export async function getSharedStreamUpstreamResponse(
  channelId: string,
  absoluteUrl: string,
  options: {
    observationSource?: SharedSessionObservationSource;
  } = {},
): Promise<SharedStreamUpstreamResponse> {
  const session = await ensureSharedSession(channelId);
  return resolveSharedUpstreamResponse(session, absoluteUrl, options.observationSource ?? "SHARED_ASSET");
}

export async function getChannelSharedStreamStatus(channelId: string): Promise<SharedStreamStatus> {
  const channel = await getChannelStreamDetails(channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  const session = sharedStreamSessions.get(channelId);

  if (!isSharedPlaybackMode(channel.playbackMode)) {
    return {
      channelId,
      configured: false,
      enabled: env.SHARED_STREAM_ENABLED,
      active: false,
      upstreamState: "DISABLED",
      message: "Shared stream delivery is not configured for this channel.",
      lastAccessAt: null,
      expiresAt: null,
      lastUpstreamRequestAt: null,
      lastError: null,
      lastErrorAt: null,
      mappedAssetCount: 0,
      cache: null,
    };
  }

  if (!env.SHARED_STREAM_ENABLED) {
    return {
      channelId,
      configured: true,
      enabled: false,
      active: false,
      upstreamState: "DISABLED",
      message: "Shared stream delivery is disabled globally.",
      lastAccessAt: null,
      expiresAt: null,
      lastUpstreamRequestAt: null,
      lastError: null,
      lastErrorAt: null,
      mappedAssetCount: 0,
      cache: null,
    };
  }

  if (!session) {
    return {
      channelId,
      configured: true,
      enabled: true,
      active: false,
      upstreamState: "IDLE",
      message: "Shared stream session will start when the first local viewer requests playback.",
      lastAccessAt: null,
      expiresAt: null,
      lastUpstreamRequestAt: null,
      lastError: null,
      lastErrorAt: null,
      mappedAssetCount: 0,
      cache: null,
    };
  }

  return {
    channelId,
    configured: true,
    enabled: true,
    active: true,
    upstreamState: getSharedUpstreamState(session),
    message:
      session.lastError !== null
        ? "Shared stream session hit an upstream error."
        : "Shared stream session is active for local viewers.",
    lastAccessAt: new Date(session.lastAccessAtMs).toISOString(),
    expiresAt: new Date(session.lastAccessAtMs + env.SHARED_STREAM_IDLE_TTL_MS).toISOString(),
    lastUpstreamRequestAt: toIsoString(session.lastUpstreamRequestAtMs),
    lastError: session.lastError,
    lastErrorAt: toIsoString(session.lastErrorAtMs),
    mappedAssetCount: session.urlsByAssetId.size,
    cache: session.cache.getSnapshot(),
  };
}

export function listSharedStreamSessionSnapshots() {
  cleanupStaleSharedStreamSessions();
  return [...sharedStreamSessions.values()].map(buildSharedSessionSnapshot);
}

export function cleanupStaleSharedStreamSessions(now = new Date()) {
  const nowMs = now.getTime();

  sharedStreamSessions.forEach((session, channelId) => {
    if (nowMs - session.lastAccessAtMs >= env.SHARED_STREAM_IDLE_TTL_MS) {
      evictSharedSession(channelId, "cleanup");
    }
  });
}

export function clearSharedStreamSessionsForTests() {
  [...sharedStreamSessions.keys()].forEach((channelId) => {
    evictSharedSession(channelId, "cleanup");
  });
}
