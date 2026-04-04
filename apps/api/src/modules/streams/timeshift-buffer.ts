import { createHash } from "node:crypto";
import { env } from "../../config/env.js";
import { writeStructuredLog } from "../../app/structured-log.js";
import { buildUpstreamHeaders, type UpstreamRequestConfig } from "../../app/upstream-request.js";
import { getChannelStreamDetails } from "../channels/channel.service.js";
import { parseMasterPlaylist } from "./playlist-parser.js";
import { resolveUri, rewriteAttributeUris } from "./playlist-rewrite.js";
import { buildSyntheticMasterPlaylist } from "./synthetic-master.js";
import { parseMediaPlaylist } from "./media-playlist.js";
import {
  buildTimeshiftStoragePath,
  deleteTimeshiftAsset,
  readTimeshiftAsset,
  writeTimeshiftAsset,
} from "./timeshift-storage.js";
import { getAvailableTimeshiftWindowSeconds, partitionTimeshiftSegmentsByCutoff } from "./timeshift-window.js";

const FETCH_TIMEOUT_MS = 8000;
const API_PREFIX = "/api";

interface TimeshiftStatus {
  channelId: string;
  configured: boolean;
  supported: boolean;
  available: boolean;
  bufferState: "DISABLED" | "UNSUPPORTED" | "STARTING" | "WARMING" | "READY" | "ERROR";
  message: string;
  windowSeconds: number;
  minimumReadyWindowSeconds: number;
  availableWindowSeconds: number;
  bufferedSegmentCount: number;
  lastUpdatedAt: string | null;
  lastError: string | null;
}

interface TimeshiftVariantDefinition {
  variantId: string;
  label: string;
  sortOrder: number;
  playlistUrl: string;
  bandwidth: number | null;
  width: number | null;
  height: number | null;
  codecs: string | null;
}

interface TimeshiftAssetRecord {
  assetId: string;
  absoluteUrl: string;
  storagePath: string;
  contentType: string;
  createdAtMs: number;
}

interface TimeshiftSegmentRecord {
  assetId: string;
  sequence: number;
  durationSeconds: number;
  absoluteUrl: string;
  tagLines: string[];
  programDateTime: string | null;
  capturedAtMs: number;
}

interface TimeshiftVariantState extends TimeshiftVariantDefinition {
  targetDurationSeconds: number;
  headerLines: string[];
  segments: TimeshiftSegmentRecord[];
  assetsById: Map<string, TimeshiftAssetRecord>;
  lastUpdatedAtMs: number | null;
  lastAccessAtMs: number | null;
}

interface ChannelTimeshiftState {
  channelId: string;
  channelSlug: string;
  requestConfig: UpstreamRequestConfig;
  windowSeconds: number;
  lastAccessAtMs: number;
  timer: ReturnType<typeof setTimeout> | null;
  refreshPromise: Promise<void> | null;
  variants: TimeshiftVariantState[];
  lastError: string | null;
  configured: boolean;
  supported: boolean;
}

const timeshiftStates = new Map<string, ChannelTimeshiftState>();

function createAssetId(sequence: number, absoluteUrl: string) {
  const hash = createHash("sha1").update(absoluteUrl).digest("hex").slice(0, 12);
  return `${sequence}-${hash}`;
}

function getWindowSeconds(windowMinutes: number | null) {
  return (windowMinutes ?? env.TIMESHIFT_DEFAULT_WINDOW_MINUTES) * 60;
}

function mapChannelRequestConfig(channel: NonNullable<Awaited<ReturnType<typeof getChannelStreamDetails>>>) {
  return {
    requestUserAgent: channel.upstreamUserAgent,
    requestReferrer: channel.upstreamReferrer,
    requestHeaders: channel.upstreamHeaders as Record<string, string> | null,
  } satisfies UpstreamRequestConfig;
}

async function fetchUpstreamResponse(url: string, requestConfig: UpstreamRequestConfig) {
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

async function resolveVariantDefinitions(
  channel: NonNullable<Awaited<ReturnType<typeof getChannelStreamDetails>>>,
): Promise<TimeshiftVariantDefinition[]> {
  if (channel.sourceMode === "MANUAL_VARIANTS") {
    return channel.qualityVariants.map((variant, index) => ({
      variantId: variant.id,
      label: variant.label,
      sortOrder: index,
      playlistUrl: variant.playlistUrl,
      bandwidth: variant.bandwidth ?? null,
      width: variant.width ?? null,
      height: variant.height ?? null,
      codecs: variant.codecs ?? null,
    }));
  }

  if (!channel.masterHlsUrl) {
    throw new Error("Channel master playlist is not configured");
  }

  const masterPlaylistUrl = channel.masterHlsUrl;
  const response = await fetchUpstreamResponse(masterPlaylistUrl, mapChannelRequestConfig(channel));
  const playlistText = await response.text();
  const parsed = parseMasterPlaylist(playlistText);

  if (!parsed.isMasterPlaylist || parsed.variantEntries.length === 0) {
    return [
      {
        variantId: "live",
        label: "Live",
        sortOrder: 0,
        playlistUrl: masterPlaylistUrl,
        bandwidth: null,
        width: null,
        height: null,
        codecs: null,
      },
    ];
  }

  return parsed.variantEntries.map((entry, index) => {
    const playlistUrl = resolveUri(entry.uri, masterPlaylistUrl);

    if (!playlistUrl) {
      throw new Error("Invalid HLS variant URI");
    }

    return {
      variantId: String(index),
      label: entry.label,
      sortOrder: index,
      playlistUrl,
      bandwidth: entry.bandwidth ?? null,
      width: null,
      height: entry.height ?? null,
      codecs: null,
    };
  });
}

function createVariantState(definition: TimeshiftVariantDefinition): TimeshiftVariantState {
  return {
    ...definition,
    targetDurationSeconds: 6,
    headerLines: ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:6"],
    segments: [],
    assetsById: new Map(),
    lastUpdatedAtMs: null,
    lastAccessAtMs: null,
  };
}

async function loadChannelTimeshiftState(channelId: string) {
  const channel = await getChannelStreamDetails(channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  const configured = channel.timeshiftEnabled && env.TIMESHIFT_ENABLED;
  const supported = configured && channel.playbackMode === "PROXY";
  const variants: TimeshiftVariantDefinition[] = supported ? await resolveVariantDefinitions(channel) : [];

  return {
    channelId: channel.id,
    channelSlug: channel.slug,
    requestConfig: mapChannelRequestConfig(channel),
    windowSeconds: getWindowSeconds(channel.timeshiftWindowMinutes ?? null),
    lastAccessAtMs: Date.now(),
    timer: null,
    refreshPromise: null,
    variants: variants.map(createVariantState),
    lastError: null,
    configured,
    supported,
  } satisfies ChannelTimeshiftState;
}

function markVariantAccessed(variant: TimeshiftVariantState) {
  variant.lastAccessAtMs = Date.now();
}

function getTrackedVariants(state: ChannelTimeshiftState) {
  const now = Date.now();
  const recentlyAccessedVariants = state.variants.filter((variant) => {
    return variant.lastAccessAtMs !== null && now - variant.lastAccessAtMs < env.TIMESHIFT_IDLE_TTL_MS;
  });

  if (recentlyAccessedVariants.length > 0) {
    return recentlyAccessedVariants;
  }

  const fallbackVariant = state.variants[0];
  return fallbackVariant ? [fallbackVariant] : [];
}

function getVariantWindowSeconds(variant: TimeshiftVariantState) {
  return getAvailableTimeshiftWindowSeconds(variant.segments);
}

function buildDisabledStatus(state: ChannelTimeshiftState): TimeshiftStatus {
  if (!state.configured) {
    return {
      channelId: state.channelId,
      configured: false,
      supported: false,
      available: false,
      bufferState: "DISABLED",
      message: "Timeshift is disabled for this channel.",
      windowSeconds: state.windowSeconds,
      minimumReadyWindowSeconds: env.TIMESHIFT_MIN_AVAILABLE_WINDOW_SECONDS,
      availableWindowSeconds: 0,
      bufferedSegmentCount: 0,
      lastUpdatedAt: null,
      lastError: null,
    };
  }

  return {
    channelId: state.channelId,
    configured: true,
    supported: false,
    available: false,
    bufferState: "UNSUPPORTED",
    message: "Timeshift requires proxy playback so TV-Dash can retain the live buffer.",
    windowSeconds: state.windowSeconds,
    minimumReadyWindowSeconds: env.TIMESHIFT_MIN_AVAILABLE_WINDOW_SECONDS,
    availableWindowSeconds: 0,
    bufferedSegmentCount: 0,
    lastUpdatedAt: null,
    lastError: null,
  };
}

function buildReadyStatus(state: ChannelTimeshiftState): TimeshiftStatus {
  if (!state.supported) {
    return buildDisabledStatus(state);
  }

  const bufferedVariants = state.variants.filter((variant) => variant.segments.length > 0);
  const availableWindowSeconds = bufferedVariants.length
    ? Math.floor(Math.min(...bufferedVariants.map((variant) => getVariantWindowSeconds(variant))))
    : 0;
  const bufferedSegmentCount = bufferedVariants.length
    ? Math.min(...bufferedVariants.map((variant) => variant.segments.length))
    : 0;
  const lastUpdatedAtMs = bufferedVariants.reduce<number | null>((latest, variant) => {
    if (variant.lastUpdatedAtMs === null) {
      return latest;
    }

    return latest === null ? variant.lastUpdatedAtMs : Math.max(latest, variant.lastUpdatedAtMs);
  }, null);
  const available = availableWindowSeconds >= env.TIMESHIFT_MIN_AVAILABLE_WINDOW_SECONDS;
  const remainingReadyWindowSeconds = Math.max(
    0,
    Math.ceil(env.TIMESHIFT_MIN_AVAILABLE_WINDOW_SECONDS - availableWindowSeconds),
  );

  return {
    channelId: state.channelId,
    configured: state.configured,
    supported: true,
    available,
    bufferState: state.lastError ? "ERROR" : lastUpdatedAtMs === null ? "STARTING" : available ? "READY" : "WARMING",
    message: state.lastError
      ? "Timeshift buffer refresh failed."
      : available
        ? "Live DVR window is ready."
        : remainingReadyWindowSeconds > 0
          ? `Timeshift buffer is warming up. DVR ready in ~${remainingReadyWindowSeconds}s.`
          : "Timeshift buffer is warming up.",
    windowSeconds: state.windowSeconds,
    minimumReadyWindowSeconds: env.TIMESHIFT_MIN_AVAILABLE_WINDOW_SECONDS,
    availableWindowSeconds,
    bufferedSegmentCount,
    lastUpdatedAt: lastUpdatedAtMs === null ? null : new Date(lastUpdatedAtMs).toISOString(),
    lastError: state.lastError,
  };
}

function scheduleRefresh(state: ChannelTimeshiftState) {
  if (!state.supported || state.timer) {
    return;
  }

  state.timer = setTimeout(async () => {
    state.timer = null;

    const isIdle = Date.now() - state.lastAccessAtMs >= env.TIMESHIFT_IDLE_TTL_MS;
    if (isIdle) {
      return;
    }

    try {
      await refreshChannelState(state);
    } finally {
      scheduleRefresh(state);
    }
  }, env.TIMESHIFT_POLL_INTERVAL_MS);
}

async function storeVariantAsset(
  state: ChannelTimeshiftState,
  variant: TimeshiftVariantState,
  segment: TimeshiftSegmentRecord,
) {
  if (variant.assetsById.has(segment.assetId)) {
    return;
  }

  const response = await fetchUpstreamResponse(segment.absoluteUrl, state.requestConfig);
  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const storagePath = buildTimeshiftStoragePath({
    channelSlug: state.channelSlug,
    variantKey: variant.variantId,
    assetId: segment.assetId,
    sourceUrl: segment.absoluteUrl,
  });

  await writeTimeshiftAsset(storagePath, data);
  variant.assetsById.set(segment.assetId, {
    assetId: segment.assetId,
    absoluteUrl: segment.absoluteUrl,
    storagePath,
    contentType,
    createdAtMs: Date.now(),
  });
}

async function evictOldSegments(state: ChannelTimeshiftState, variant: TimeshiftVariantState) {
  const cutoffMs = Date.now() - state.windowSeconds * 1000;
  const { retained: retainedSegments, evicted: evictedSegments } = partitionTimeshiftSegmentsByCutoff(
    variant.segments,
    cutoffMs,
  );

  variant.segments = retainedSegments;

  for (const segment of evictedSegments) {
    const asset = variant.assetsById.get(segment.assetId);
    if (!asset) {
      continue;
    }

    variant.assetsById.delete(segment.assetId);
    await deleteTimeshiftAsset(asset.storagePath);
  }
}

async function refreshVariantState(state: ChannelTimeshiftState, variant: TimeshiftVariantState) {
  markVariantAccessed(variant);
  const response = await fetchUpstreamResponse(variant.playlistUrl, state.requestConfig);
  const playlistText = await response.text();
  const parsed = parseMediaPlaylist(playlistText, variant.playlistUrl);
  const existingAssetIds = new Set(variant.segments.map((segment) => segment.assetId));
  const newSegments: TimeshiftSegmentRecord[] = [];

  parsed.segments.forEach((segment) => {
    const assetId = createAssetId(segment.sequence, segment.absoluteUrl);

    if (existingAssetIds.has(assetId)) {
      return;
    }

    newSegments.push({
      assetId,
      sequence: segment.sequence,
      durationSeconds: segment.durationSeconds,
      absoluteUrl: segment.absoluteUrl,
      tagLines: segment.tagLines,
      programDateTime: segment.programDateTime,
      capturedAtMs: Date.now(),
    });
  });

  for (const segment of newSegments) {
    await storeVariantAsset(state, variant, segment);
  }

  variant.segments = [...variant.segments, ...newSegments].sort((left, right) => left.sequence - right.sequence);
  variant.targetDurationSeconds = parsed.targetDurationSeconds;
  variant.headerLines = parsed.headerLines;
  variant.lastUpdatedAtMs = Date.now();
  await evictOldSegments(state, variant);
}

async function refreshChannelState(state: ChannelTimeshiftState, requestedVariants?: TimeshiftVariantState[]) {
  if (!state.supported) {
    return;
  }

  if (state.refreshPromise) {
    return state.refreshPromise;
  }

  state.refreshPromise = (async () => {
    try {
      const variantsToRefresh = requestedVariants && requestedVariants.length > 0
        ? requestedVariants
        : getTrackedVariants(state);

      await Promise.all(variantsToRefresh.map((variant) => refreshVariantState(state, variant)));
      state.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown timeshift failure";
      state.lastError = message;
      writeStructuredLog("warn", {
        event: "stream.timeshift.refresh.failed",
        channelId: state.channelId,
        channelSlug: state.channelSlug,
        detail: {
          message,
        },
      });
    } finally {
      state.refreshPromise = null;
    }
  })();

  return state.refreshPromise;
}

async function getOrCreateState(channelId: string) {
  const existing = timeshiftStates.get(channelId);

  if (existing) {
    existing.lastAccessAtMs = Date.now();
    scheduleRefresh(existing);
    return existing;
  }

  const state = await loadChannelTimeshiftState(channelId);
  if (state.variants[0]) {
    markVariantAccessed(state.variants[0]);
  }
  timeshiftStates.set(channelId, state);
  await refreshChannelState(state);
  scheduleRefresh(state);
  return state;
}

function buildTimeshiftAssetPath(channelId: string, assetId: string) {
  return `${API_PREFIX}/streams/channels/${channelId}/timeshift/assets/${encodeURIComponent(assetId)}`;
}

function buildTimeshiftVariantPlaylist(state: ChannelTimeshiftState, variant: TimeshiftVariantState) {
  if (!variant.segments.length) {
    throw new Error("Timeshift buffer is still empty");
  }

  const firstSequence = variant.segments[0]?.sequence ?? 0;
  const headerLines = variant.headerLines.filter(
    (line) => line !== "#EXTM3U" && !line.startsWith("#EXT-X-MEDIA-SEQUENCE"),
  );
  const lines = [
    "#EXTM3U",
    ...headerLines,
    `#EXT-X-TARGETDURATION:${Math.max(1, variant.targetDurationSeconds)}`,
    `#EXT-X-MEDIA-SEQUENCE:${firstSequence}`,
    "#EXT-X-PLAYLIST-TYPE:EVENT",
  ];

  variant.segments.forEach((segment) => {
    segment.tagLines.forEach((line) => {
      lines.push(
        rewriteAttributeUris(line, segment.absoluteUrl, () => buildTimeshiftAssetPath(state.channelId, segment.assetId)),
      );
    });
    lines.push(buildTimeshiftAssetPath(state.channelId, segment.assetId));
  });

  return `${lines.join("\n")}\n`;
}

export async function getChannelTimeshiftStatus(channelId: string) {
  const state = await getOrCreateState(channelId);
  return buildReadyStatus(state);
}

export async function getChannelTimeshiftMasterResponse(channelId: string) {
  const state = await getOrCreateState(channelId);
  const status = buildReadyStatus(state);

  if (!status.supported) {
    throw new Error(status.message);
  }

  const body = buildSyntheticMasterPlaylist(
    state.variants.map((variant) => ({
      label: variant.label,
      sortOrder: variant.sortOrder,
      playlistUrl: `${API_PREFIX}/streams/channels/${state.channelId}/timeshift/variants/${encodeURIComponent(variant.variantId)}/index.m3u8`,
      width: variant.width,
      height: variant.height,
      bandwidth: variant.bandwidth,
      codecs: variant.codecs,
    })),
  );

  return {
    body,
    contentType: "application/vnd.apple.mpegurl",
  };
}

export async function getChannelTimeshiftVariantResponse(channelId: string, variantId: string) {
  const state = await getOrCreateState(channelId);
  const variant = state.variants.find((entry) => entry.variantId === variantId);

  if (!variant) {
    throw new Error("Timeshift variant not found");
  }

  if (!state.supported) {
    throw new Error("Timeshift is not available for this channel");
  }

  markVariantAccessed(variant);

  if (!variant.segments.length) {
    await refreshChannelState(state, [variant]);
  }

  return {
    body: buildTimeshiftVariantPlaylist(state, variant),
    contentType: "application/vnd.apple.mpegurl",
  };
}

export async function getChannelTimeshiftAssetResponse(channelId: string, assetId: string) {
  const state = await getOrCreateState(channelId);
  const variant = state.variants.find((entry) => entry.assetsById.has(assetId));
  const asset = variant?.assetsById.get(assetId);

  if (!variant || !asset) {
    throw new Error("Timeshift asset not found");
  }

  markVariantAccessed(variant);

  const body = await readTimeshiftAsset(asset.storagePath);

  return {
    body,
    contentType: asset.contentType,
  };
}

export function clearTimeshiftBufferStateForTests() {
  timeshiftStates.forEach((state) => {
    if (state.timer) {
      clearTimeout(state.timer);
    }
  });
  timeshiftStates.clear();
}
