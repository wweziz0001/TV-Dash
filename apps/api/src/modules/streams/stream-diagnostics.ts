import type { DiagnosticFailureKind } from "@tv-dash/shared";

export interface StreamFailureClassification {
  failureKind: DiagnosticFailureKind;
  message: string;
  retryable: boolean;
  statusCode: number | null;
}

export interface StreamFailureContext {
  operation: "stream-inspection" | "proxy-master" | "proxy-asset" | "synthetic-master" | "timeshift";
}

function parseStatusCode(message: string) {
  const match = message.match(/(\d{3})$/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildClassification(
  failureKind: DiagnosticFailureKind,
  message: string,
  retryable: boolean,
  statusCode: number | null = null,
): StreamFailureClassification {
  return {
    failureKind,
    message,
    retryable,
    statusCode,
  };
}

export function classifyStreamFailure(error: unknown, context: StreamFailureContext): StreamFailureClassification {
  if (error instanceof Error && error.name === "AbortError") {
    return buildClassification("network", "Upstream request timed out", true);
  }

  const message = error instanceof Error ? error.message : "Unknown stream failure";

  if (message === "Invalid or expired proxy token") {
    return buildClassification("validation", message, false, 400);
  }

  if (message === "Channel not found") {
    return buildClassification("misconfiguration", message, false, 404);
  }

  if (message === "Channel master playlist is not configured") {
    return buildClassification("misconfiguration", message, false);
  }

  if (
    message === "Timeshift asset not found" ||
    message === "Timeshift variant not found" ||
    message === "Timeshift is not available for this channel" ||
    message === "Timeshift is disabled for this channel." ||
    message === "Timeshift requires proxy playback so TV-Dash can retain the live buffer."
  ) {
    return buildClassification("misconfiguration", message, false, 404);
  }

  if (message === "Timeshift buffer is still empty") {
    return buildClassification("playlist-fetch", "Timeshift buffer is still warming up", true, 400);
  }

  if (message.startsWith("Synthetic master playlist could not be generated")) {
    return buildClassification("synthetic-master", message, false);
  }

  if (message.startsWith("Invalid HLS playlist")) {
    return buildClassification("invalid-playlist", message, false);
  }

  if (message.startsWith("Unsupported or non-HLS response")) {
    return buildClassification("unsupported-stream", message, false);
  }

  if (message.startsWith("Upstream returned")) {
    const statusCode = parseStatusCode(message);
    const retryable = statusCode ? statusCode >= 500 || statusCode === 429 : false;
    return buildClassification(
      context.operation === "proxy-asset" ? "proxy-forwarding" : "playlist-fetch",
      message,
      retryable,
      statusCode,
    );
  }

  if (error instanceof TypeError) {
    return buildClassification("network", message, true);
  }

  return buildClassification("unknown", message, false);
}
