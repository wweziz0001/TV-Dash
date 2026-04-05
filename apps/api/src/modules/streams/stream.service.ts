import { isTvDashManagedPlaybackMode } from "@tv-dash/shared";
import { writeStructuredLog, sanitizeUrl, summarizeUpstreamRequestConfig } from "../../app/structured-log.js";
import { buildUpstreamHeaders, type UpstreamRequestConfig } from "../../app/upstream-request.js";
import {
  createOrUpdateActiveOperationalAlert,
  resolveOperationalAlertByDedupeKey,
} from "../alerts/alert.service.js";
import { getChannelStreamDetails } from "../channels/channel.service.js";
import { buildChannelDiagnosticsSnapshot, recordChannelObservation } from "../diagnostics/diagnostic.service.js";
import { parseMasterPlaylist } from "./playlist-parser.js";
import { classifyStreamFailure } from "./stream-diagnostics.js";
import { isPlaylistResponse, rewritePlaylist } from "./playlist-rewrite.js";
import { createProxyToken, readProxyToken } from "./proxy-token.js";
import { buildSyntheticMasterPlaylist } from "./synthetic-master.js";

const RECORDING_PROXY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const CHANNEL_STREAM_ALERT_THRESHOLD = 2;

function buildChannelStreamAlertDedupeKey(channelId: string, subsystem: "proxyMaster" | "syntheticMaster") {
  return `channel-stream:${channelId}:${subsystem}`;
}

async function syncChannelStreamAlert(params: {
  channel: NonNullable<Awaited<ReturnType<typeof getChannelStreamDetails>>>;
  subsystem: "proxyMaster" | "syntheticMaster";
  status: "success" | "failure";
  consecutiveFailuresBefore: number;
  consecutiveFailuresAfter: number;
  failureKind?: string | null;
  reason?: string | null;
}) {
  const sourceLabel = params.subsystem === "syntheticMaster" ? "synthetic playback master" : "playback master";
  const dedupeKey = buildChannelStreamAlertDedupeKey(params.channel.id, params.subsystem);

  if (params.status === "failure" && params.consecutiveFailuresAfter >= CHANNEL_STREAM_ALERT_THRESHOLD) {
    await createOrUpdateActiveOperationalAlert({
      dedupeKey,
      type: "CHANNEL_STREAM_DOWN",
      category: "CHANNEL_HEALTH",
      severity: params.subsystem === "syntheticMaster" ? "ERROR" : "CRITICAL",
      sourceSubsystem: params.subsystem === "syntheticMaster" ? "streams.synthetic-master" : "streams.proxy",
      title: `${params.channel.name} stream unavailable`,
      message: `TV-Dash failed to build or fetch the ${sourceLabel} ${params.consecutiveFailuresAfter} time(s) in a row.`,
      relatedEntityType: "CHANNEL",
      relatedEntityId: params.channel.id,
      metadata: {
        channelName: params.channel.name,
        channelSlug: params.channel.slug,
        sourceLabel,
        consecutiveFailures: params.consecutiveFailuresAfter,
        failureKind: params.failureKind ?? "unknown",
        reason: params.reason ?? "Unknown stream failure",
      },
    });
    return;
  }

  if (params.status === "success" && params.consecutiveFailuresBefore >= CHANNEL_STREAM_ALERT_THRESHOLD) {
    await resolveOperationalAlertByDedupeKey({
      dedupeKey,
      resolutionNotification: {
        type: "CHANNEL_STREAM_RECOVERED",
        category: "CHANNEL_HEALTH",
        severity: "SUCCESS",
        sourceSubsystem: params.subsystem === "syntheticMaster" ? "streams.synthetic-master" : "streams.proxy",
        title: `${params.channel.name} stream recovered`,
        message: `TV-Dash can serve the ${sourceLabel} again after repeated failures.`,
        relatedEntityType: "CHANNEL",
        relatedEntityId: params.channel.id,
        metadata: {
          channelName: params.channel.name,
          channelSlug: params.channel.slug,
          sourceLabel,
          previousConsecutiveFailures: params.consecutiveFailuresBefore,
        },
      },
    });
  }
}

function buildProxyAssetPath(channelId: string, target: string, options: { ttlMs?: number } = {}) {
  const token = createProxyToken({ channelId, target }, options.ttlMs ? { ttlMs: options.ttlMs } : undefined);
  return `/api/streams/channels/${channelId}/asset?token=${encodeURIComponent(token)}`;
}

async function fetchUpstream(url: string, requestConfig: UpstreamRequestConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

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

function mapChannelRequestConfig(channel: NonNullable<Awaited<ReturnType<typeof getChannelStreamDetails>>>) {
  return {
    requestUserAgent: channel.upstreamUserAgent,
    requestReferrer: channel.upstreamReferrer,
    requestHeaders: channel.upstreamHeaders as Record<string, string> | null,
  } satisfies UpstreamRequestConfig;
}

async function proxyStreamUrl(
  channelId: string,
  targetUrl: string,
  observationSource: "PROXY_MASTER" | "PROXY_ASSET",
  options: {
    assetTokenTtlMs?: number;
  } = {},
) {
  const channel = await getChannelStreamDetails(channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  const relevantSubsystem = observationSource === "PROXY_MASTER" ? "proxyMaster" : null;
  const snapshotBefore = relevantSubsystem ? buildChannelDiagnosticsSnapshot(channel) : null;

  try {
    const response = await fetchUpstream(targetUrl, mapChannelRequestConfig(channel));
    const contentType = response.headers.get("content-type");

    if (isPlaylistResponse(contentType, targetUrl)) {
      const playlist = await response.text();
      parseMasterPlaylist(playlist);
      const rewrittenPlaylist = rewritePlaylist(playlist, targetUrl, (absoluteUrl) =>
        buildProxyAssetPath(channel.id, absoluteUrl, { ttlMs: options.assetTokenTtlMs }),
      );

      recordChannelObservation(channel.id, observationSource === "PROXY_MASTER" ? "proxyMaster" : "proxyAsset", {
        status: "success",
        source: observationSource,
        detail: {
          contentType: contentType ?? "application/vnd.apple.mpegurl",
          targetUrl: sanitizeUrl(targetUrl),
        },
      });

      if (snapshotBefore && relevantSubsystem) {
        void syncChannelStreamAlert({
          channel,
          subsystem: relevantSubsystem,
          status: "success",
          consecutiveFailuresBefore: snapshotBefore[relevantSubsystem].consecutiveFailures,
          consecutiveFailuresAfter: 0,
        }).catch(() => undefined);
      }

      return {
        body: rewrittenPlaylist,
        contentType: contentType ?? "application/vnd.apple.mpegurl",
      };
    }

    recordChannelObservation(channel.id, observationSource === "PROXY_MASTER" ? "proxyMaster" : "proxyAsset", {
      status: "success",
      source: observationSource,
      detail: {
        contentType: contentType ?? "application/octet-stream",
        targetUrl: sanitizeUrl(targetUrl),
      },
    });

    if (snapshotBefore && relevantSubsystem) {
      void syncChannelStreamAlert({
        channel,
        subsystem: relevantSubsystem,
        status: "success",
        consecutiveFailuresBefore: snapshotBefore[relevantSubsystem].consecutiveFailures,
        consecutiveFailuresAfter: 0,
      }).catch(() => undefined);
    }

    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: contentType ?? "application/octet-stream",
    };
  } catch (error) {
    const classification = classifyStreamFailure(error, {
      operation: observationSource === "PROXY_MASTER" ? "proxy-master" : "proxy-asset",
    });

    recordChannelObservation(channel.id, observationSource === "PROXY_MASTER" ? "proxyMaster" : "proxyAsset", {
      status: "failure",
      source: observationSource,
      reason: classification.message,
      failureKind: classification.failureKind,
      retryable: classification.retryable,
      detail: {
        statusCode: classification.statusCode,
        targetUrl: sanitizeUrl(targetUrl),
      },
    });

    if (relevantSubsystem) {
      const snapshotAfter = buildChannelDiagnosticsSnapshot(channel);
      void syncChannelStreamAlert({
        channel,
        subsystem: relevantSubsystem,
        status: "failure",
        consecutiveFailuresBefore: snapshotBefore?.[relevantSubsystem].consecutiveFailures ?? 0,
        consecutiveFailuresAfter: snapshotAfter[relevantSubsystem].consecutiveFailures,
        failureKind: classification.failureKind,
        reason: classification.message,
      }).catch(() => undefined);
    }

    writeStructuredLog("warn", {
      event: observationSource === "PROXY_MASTER" ? "stream.proxy.master.failed" : "stream.proxy.asset.failed",
      channelId: channel.id,
      channelSlug: channel.slug,
      failureKind: classification.failureKind,
      retryable: classification.retryable,
      statusCode: classification.statusCode,
      detail: {
        targetUrl: sanitizeUrl(targetUrl),
      },
    });

    throw error;
  }
}

export async function inspectStream(url: string, requestConfig: UpstreamRequestConfig = {}) {
  try {
    const response = await fetchUpstream(url, requestConfig);
    const text = await response.text();
    const contentType = response.headers.get("content-type");
    const parsed = parseMasterPlaylist(text);

    return {
      ok: true,
      contentType,
      variantCount: parsed.variantCount,
      variants: parsed.variants,
      isMasterPlaylist: parsed.isMasterPlaylist,
    };
  } catch (error) {
    const classification = classifyStreamFailure(error, { operation: "stream-inspection" });

    writeStructuredLog("warn", {
      event: "stream.inspect.failed",
      failureKind: classification.failureKind,
      retryable: classification.retryable,
      statusCode: classification.statusCode,
      detail: {
        targetUrl: sanitizeUrl(url),
        ...summarizeUpstreamRequestConfig(requestConfig),
      },
    });

    throw error;
  }
}

export async function getChannelProxyMasterResponse(
  channelId: string,
  options: {
    intent?: "playback" | "recording";
  } = {},
) {
  const channel = await getChannelStreamDetails(channelId);

  if (!channel) {
    return null;
  }

  if (channel.sourceMode === "MANUAL_VARIANTS") {
    const snapshotBefore = buildChannelDiagnosticsSnapshot(channel);

    try {
      const assetTokenTtlMs = options.intent === "recording" ? RECORDING_PROXY_TOKEN_TTL_MS : undefined;
      const body = buildSyntheticMasterPlaylist(channel.qualityVariants, {
        rewriteUri:
          isTvDashManagedPlaybackMode(channel.playbackMode)
            ? (absoluteUrl) => buildProxyAssetPath(channel.id, absoluteUrl, { ttlMs: assetTokenTtlMs })
            : undefined,
      });

      recordChannelObservation(channel.id, "syntheticMaster", {
        status: "success",
        source: "SYNTHETIC_MASTER",
        detail: {
          variantCount: channel.qualityVariants.length,
          playbackMode: channel.playbackMode,
        },
      });

      void syncChannelStreamAlert({
        channel,
        subsystem: "syntheticMaster",
        status: "success",
        consecutiveFailuresBefore: snapshotBefore.syntheticMaster.consecutiveFailures,
        consecutiveFailuresAfter: 0,
      }).catch(() => undefined);

      return {
        body,
        contentType: "application/vnd.apple.mpegurl",
      };
    } catch (error) {
      const classification = classifyStreamFailure(error, { operation: "synthetic-master" });

      recordChannelObservation(channel.id, "syntheticMaster", {
        status: "failure",
        source: "SYNTHETIC_MASTER",
        reason: classification.message,
        failureKind: classification.failureKind,
        retryable: classification.retryable,
        detail: {
          variantCount: channel.qualityVariants.length,
          playbackMode: channel.playbackMode,
        },
      });

      const snapshotAfter = buildChannelDiagnosticsSnapshot(channel);
      void syncChannelStreamAlert({
        channel,
        subsystem: "syntheticMaster",
        status: "failure",
        consecutiveFailuresBefore: snapshotBefore.syntheticMaster.consecutiveFailures,
        consecutiveFailuresAfter: snapshotAfter.syntheticMaster.consecutiveFailures,
        failureKind: classification.failureKind,
        reason: classification.message,
      }).catch(() => undefined);

      writeStructuredLog("error", {
        event: "stream.synthetic-master.failed",
        channelId: channel.id,
        channelSlug: channel.slug,
        failureKind: classification.failureKind,
        retryable: classification.retryable,
        statusCode: classification.statusCode,
        detail: {
          variantCount: channel.qualityVariants.length,
          playbackMode: channel.playbackMode,
        },
      });

      throw error;
    }
  }

  if (!channel.masterHlsUrl) {
    throw new Error("Channel master playlist is not configured");
  }

  return proxyStreamUrl(channelId, channel.masterHlsUrl, "PROXY_MASTER", {
    assetTokenTtlMs: options.intent === "recording" ? RECORDING_PROXY_TOKEN_TTL_MS : undefined,
  });
}

export async function getChannelProxyAssetResponse(channelId: string, token: string) {
  const payload = readProxyToken(token, channelId);

  if (!payload) {
    throw new Error("Invalid or expired proxy token");
  }

  return proxyStreamUrl(channelId, payload.target, "PROXY_ASSET");
}
