import type { DiagnosticFailureKind } from "@tv-dash/shared";
import type { FastifyBaseLogger } from "fastify";
import type { UpstreamRequestConfig } from "./upstream-request.js";

type LogLevel = "info" | "warn" | "error";

type LoggerLike = Pick<FastifyBaseLogger, LogLevel>;

export type StructuredLogCategory = "playback" | "stream" | "epg" | "auth" | "admin" | "system";

export interface StructuredLogFields {
  event: string;
  actorUserId?: string | null;
  channelId?: string;
  channelSlug?: string;
  epgSourceId?: string;
  sessionId?: string;
  failureKind?: DiagnosticFailureKind;
  retryable?: boolean | null;
  statusCode?: number | null;
  detail?: Record<string, string | number | boolean | null | undefined> | null;
  [key: string]: unknown;
}

export interface StructuredLogEntry extends StructuredLogFields {
  id: string;
  level: LogLevel;
  timestamp: string;
  category: StructuredLogCategory;
}

interface StructuredLogFilters {
  level?: LogLevel;
  category?: StructuredLogCategory;
  actorUserId?: string;
  channelId?: string;
  sessionId?: string;
  search?: string;
  limit?: number;
}

let appLogger: LoggerLike | null = null;
const MAX_RETAINED_LOG_ENTRIES = 1000;
const structuredLogBuffer: StructuredLogEntry[] = [];

export function configureStructuredLogger(logger: LoggerLike) {
  appLogger = logger;
}

function categorizeStructuredLogEvent(event: string): StructuredLogCategory {
  if (event.startsWith("playback.")) {
    return "playback";
  }

  if (event.startsWith("stream.")) {
    return "stream";
  }

  if (event.startsWith("epg.")) {
    return "epg";
  }

  if (event.startsWith("auth.")) {
    return "auth";
  }

  if (event.includes(".admin.") || event.startsWith("admin.")) {
    return "admin";
  }

  return "system";
}

export function writeStructuredLog(level: LogLevel, fields: StructuredLogFields) {
  const payload = {
    ...fields,
    detail: fields.detail ?? undefined,
    timestamp: new Date().toISOString(),
  };
  const entry: StructuredLogEntry = {
    ...fields,
    detail: fields.detail ?? null,
    id: crypto.randomUUID(),
    level,
    timestamp: payload.timestamp,
    category: categorizeStructuredLogEvent(fields.event),
  };

  structuredLogBuffer.unshift(entry);
  if (structuredLogBuffer.length > MAX_RETAINED_LOG_ENTRIES) {
    structuredLogBuffer.length = MAX_RETAINED_LOG_ENTRIES;
  }

  if (appLogger) {
    appLogger[level](payload);
  } else {
    const line = JSON.stringify({
      level,
      ...payload,
    });

    const output = level === "error" ? process.stderr : process.stdout;
    output.write(`${line}\n`);
  }
}

function normalizeSearchValue(value: unknown) {
  if (typeof value === "string") {
    return value.toLowerCase();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase();
  }

  return null;
}

function matchesStructuredLogSearch(entry: StructuredLogEntry, search: string) {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  const detailValues = Object.values(entry.detail ?? {})
    .map(normalizeSearchValue)
    .filter((value): value is string => Boolean(value));
  const haystack = [
    entry.event,
    entry.category,
    entry.level,
    entry.actorUserId,
    entry.channelId,
    entry.channelSlug,
    entry.epgSourceId,
    String((entry as { sessionId?: string }).sessionId ?? ""),
    ...detailValues,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return haystack.some((value) => value.includes(normalizedSearch));
}

export function listStructuredLogs(filters: StructuredLogFilters = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);

  return structuredLogBuffer
    .filter((entry) => {
      if (filters.level && entry.level !== filters.level) {
        return false;
      }

      if (filters.category && entry.category !== filters.category) {
        return false;
      }

      if (filters.actorUserId && entry.actorUserId !== filters.actorUserId) {
        return false;
      }

      if (filters.channelId && entry.channelId !== filters.channelId) {
        return false;
      }

      if (filters.sessionId && (entry as { sessionId?: string }).sessionId !== filters.sessionId) {
        return false;
      }

      if (filters.search && !matchesStructuredLogSearch(entry, filters.search)) {
        return false;
      }

      return true;
    })
    .slice(0, limit);
}

export function countStructuredLogsByLevel(level: LogLevel) {
  return structuredLogBuffer.reduce((count, entry) => count + (entry.level === level ? 1 : 0), 0);
}

export function resetStructuredLogBuffer() {
  structuredLogBuffer.length = 0;
}

export function sanitizeUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function summarizeUpstreamRequestConfig(config: UpstreamRequestConfig) {
  return {
    hasUserAgent: Boolean(config.requestUserAgent),
    hasReferrer: Boolean(config.requestReferrer),
    headerCount: Object.keys(config.requestHeaders ?? {}).length,
  };
}

export function summarizeError(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      name: "UnknownError",
      message: "Unknown error",
    };
  }

  return {
    name: error.name,
    message: error.message,
  };
}

export function summarizeEmailAddress(email: string) {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");

  if (atIndex < 1) {
    return {
      emailDomain: null,
      identifierHint: "invalid-email-format",
    };
  }

  return {
    emailDomain: normalized.slice(atIndex + 1),
    identifierHint: `${normalized[0]}***`,
  };
}
