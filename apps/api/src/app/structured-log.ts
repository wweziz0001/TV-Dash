import type { DiagnosticFailureKind } from "@tv-dash/shared";
import type { FastifyBaseLogger } from "fastify";
import type { UpstreamRequestConfig } from "./upstream-request.js";

type LogLevel = "info" | "warn" | "error";

type LoggerLike = Pick<FastifyBaseLogger, LogLevel>;

export interface StructuredLogFields {
  event: string;
  actorUserId?: string | null;
  channelId?: string;
  channelSlug?: string;
  epgSourceId?: string;
  failureKind?: DiagnosticFailureKind;
  retryable?: boolean | null;
  statusCode?: number | null;
  detail?: Record<string, string | number | boolean | null | undefined> | null;
  [key: string]: unknown;
}

let appLogger: LoggerLike | null = null;

export function configureStructuredLogger(logger: LoggerLike) {
  appLogger = logger;
}

export function writeStructuredLog(level: LogLevel, fields: StructuredLogFields) {
  const payload = {
    ...fields,
    detail: fields.detail ?? undefined,
    timestamp: new Date().toISOString(),
  };

  if (appLogger) {
    appLogger[level](payload);
    return;
  }

  const line = JSON.stringify({
    level,
    ...payload,
  });

  const output = level === "error" ? process.stderr : process.stdout;
  output.write(`${line}\n`);
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
