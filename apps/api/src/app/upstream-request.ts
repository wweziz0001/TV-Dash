import { env } from "../config/env.js";

export interface UpstreamRequestConfig {
  requestUserAgent?: string | null;
  requestReferrer?: string | null;
  requestHeaders?: Record<string, string> | null | undefined;
}

export function normalizeUpstreamHeaders(headers: unknown) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) =>
      typeof value === "string" && key.trim()
        ? [[key.trim(), value]]
        : [],
    ),
  );
}

export function buildUpstreamHeaders(
  config: UpstreamRequestConfig,
  { defaultUserAgent = `TV-Dash/0.1 (+${env.CLIENT_URL})` }: { defaultUserAgent?: string } = {},
) {
  const headers = new Headers();

  headers.set("user-agent", config.requestUserAgent || defaultUserAgent);

  if (config.requestReferrer) {
    headers.set("referer", config.requestReferrer);
  }

  for (const [key, value] of Object.entries(normalizeUpstreamHeaders(config.requestHeaders))) {
    headers.set(key, value);
  }

  return headers;
}
