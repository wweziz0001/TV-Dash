import type { EpgSourceInput } from "@tv-dash/shared";
import {
  sanitizeUrl,
  summarizeUpstreamRequestConfig,
  writeStructuredLog,
} from "../../app/structured-log.js";
import { normalizeUpstreamHeaders, buildUpstreamHeaders } from "../../app/upstream-request.js";
import { getChannelsForEpgLookup } from "../channels/channel.service.js";
import {
  recordChannelGuideStatus,
  recordEpgCacheState,
  recordEpgObservation,
} from "../diagnostics/diagnostic.service.js";
import {
  createEpgSource,
  deleteEpgSource,
  findEpgSourceById,
  listEpgSources,
  updateEpgSource,
} from "./epg.repository.js";
import { classifyEpgFailure } from "./epg-diagnostics.js";
import { getNowNextProgramme, parseXmltvDocument } from "./xmltv-parser.js";

const xmltvCache = new Map<string, { expiresAt: number; document: ReturnType<typeof parseXmltvDocument> }>();

type EpgSourceLike = {
  id: string;
  name: string;
  slug: string;
  sourceType: "XMLTV";
  isActive: boolean;
  requestUserAgent: string | null;
  requestReferrer: string | null;
  requestHeaders: unknown;
  url?: string;
  refreshIntervalMinutes?: number;
  createdAt?: Date;
  updatedAt?: Date;
  _count?: {
    channels: number;
  };
};

function mapEpgSource<TSource extends EpgSourceLike | null>(source: TSource) {
  if (!source) {
    return null;
  }

  return {
    ...source,
    requestUserAgent: source.requestUserAgent ?? null,
    requestReferrer: source.requestReferrer ?? null,
    requestHeaders: normalizeUpstreamHeaders(source.requestHeaders),
  };
}

async function loadXmltvSource(
  source: Required<Pick<EpgSourceLike, "id" | "url" | "refreshIntervalMinutes" | "requestUserAgent" | "requestReferrer" | "requestHeaders">>,
) {
  const cached = xmltvCache.get(source.id);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.document;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: buildUpstreamHeaders(
        {
          requestUserAgent: source.requestUserAgent,
          requestReferrer: source.requestReferrer,
          requestHeaders: normalizeUpstreamHeaders(source.requestHeaders),
        },
        { defaultUserAgent: "TV-Dash/0.1 XMLTV" },
      ),
    });

    if (!response.ok) {
      throw new Error(`EPG upstream returned ${response.status}`);
    }

    const xml = await response.text();
    recordEpgObservation(source.id, "fetch", {
      status: "success",
      source: "XMLTV_LOAD",
      detail: {
        sourceUrl: sanitizeUrl(source.url),
      },
    });
    const document = parseXmltvDocument(xml);
    const expiresAt = new Date(Date.now() + source.refreshIntervalMinutes * 60_000);

    recordEpgObservation(source.id, "parse", {
      status: "success",
      source: "XMLTV_LOAD",
      detail: {
        channelCount: document.channels.length,
        programmeCount: document.programmes.length,
      },
    });
    recordEpgCacheState({
      sourceId: source.id,
      expiresAt,
      channelCount: document.channels.length,
      programmeCount: document.programmes.length,
    });

    xmltvCache.set(source.id, {
      expiresAt: expiresAt.getTime(),
      document,
    });

    return document;
  } catch (error) {
    const classification = classifyEpgFailure(error);
    const subsystem = classification.failureKind === "epg-parse" ? "parse" : "fetch";

    recordEpgObservation(source.id, subsystem, {
      status: "failure",
      source: "XMLTV_LOAD",
      reason: classification.message,
      failureKind: classification.failureKind,
      retryable: classification.retryable,
      detail: {
        sourceUrl: sanitizeUrl(source.url),
        statusCode: classification.statusCode,
      },
    });

    writeStructuredLog(classification.failureKind === "epg-parse" ? "error" : "warn", {
      event: classification.failureKind === "epg-parse" ? "epg.parse.failed" : "epg.fetch.failed",
      epgSourceId: source.id,
      failureKind: classification.failureKind,
      retryable: classification.retryable,
      statusCode: classification.statusCode,
      detail: {
        sourceUrl: sanitizeUrl(source.url),
        ...summarizeUpstreamRequestConfig({
          requestUserAgent: source.requestUserAgent,
          requestReferrer: source.requestReferrer,
          requestHeaders: normalizeUpstreamHeaders(source.requestHeaders),
        }),
      },
    });

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function listConfiguredEpgSources() {
  return listEpgSources().then((sources) => sources.map((source) => mapEpgSource(source)));
}

export function getEpgSource(id: string) {
  return findEpgSourceById(id).then(mapEpgSource);
}

export function createConfiguredEpgSource(payload: EpgSourceInput) {
  return createEpgSource(payload).then((source) => mapEpgSource(source));
}

export function updateConfiguredEpgSource(id: string, payload: EpgSourceInput) {
  return updateEpgSource(id, payload).then((source) => mapEpgSource(source));
}

export function deleteConfiguredEpgSource(id: string) {
  xmltvCache.delete(id);
  return deleteEpgSource(id);
}

export async function previewEpgSourceChannels(id: string) {
  const source = await findEpgSourceById(id);

  if (!source) {
    return null;
  }

  const document = await loadXmltvSource(source);

  return {
    source: mapEpgSource(source),
    channels: document.channels,
  };
}

export async function getNowNextForChannels(channelIds: string[]) {
  const channels = await getChannelsForEpgLookup(channelIds);
  const results = [];
  const sourceDocuments = new Map<string, ReturnType<typeof parseXmltvDocument>>();

  for (const channel of channels) {
    if (!channel.epgSource || !channel.epgChannelId) {
      recordChannelGuideStatus({
        channelId: channel.id,
        status: "unconfigured",
        sourceId: channel.epgSource?.id ?? null,
        epgChannelId: channel.epgChannelId ?? null,
      });
      results.push({
        channelId: channel.id,
        status: "UNCONFIGURED" as const,
        now: null,
        next: null,
      });
      continue;
    }

    if (!channel.epgSource.isActive) {
      recordChannelGuideStatus({
        channelId: channel.id,
        status: "source-inactive",
        sourceId: channel.epgSource.id,
        epgChannelId: channel.epgChannelId,
      });
      results.push({
        channelId: channel.id,
        status: "UNCONFIGURED" as const,
        now: null,
        next: null,
      });
      continue;
    }

    const cacheKey = channel.epgSource.id;
    let document = sourceDocuments.get(cacheKey);

    if (!document) {
      try {
        document = await loadXmltvSource(channel.epgSource);
        sourceDocuments.set(cacheKey, document);
      } catch {
        recordChannelGuideStatus({
          channelId: channel.id,
          status: "source-error",
          sourceId: channel.epgSource.id,
          epgChannelId: channel.epgChannelId,
        });
        results.push({
          channelId: channel.id,
          status: "SOURCE_ERROR" as const,
          now: null,
          next: null,
        });
        continue;
      }
    }

    const { now, next } = getNowNextProgramme(document.programmes, channel.epgChannelId);
    const status = now || next ? ("READY" as const) : ("NO_DATA" as const);

    recordChannelGuideStatus({
      channelId: channel.id,
      status: status === "READY" ? "ready" : "no-data",
      sourceId: channel.epgSource.id,
      epgChannelId: channel.epgChannelId,
    });

    results.push({
      channelId: channel.id,
      status,
      now: now
        ? {
            title: now.title,
            subtitle: now.subtitle,
            description: now.description,
            start: now.start.toISOString(),
            stop: now.stop?.toISOString() ?? null,
          }
        : null,
      next: next
        ? {
            title: next.title,
            subtitle: next.subtitle,
            description: next.description,
            start: next.start.toISOString(),
            stop: next.stop?.toISOString() ?? null,
          }
        : null,
    });
  }

  return results;
}
