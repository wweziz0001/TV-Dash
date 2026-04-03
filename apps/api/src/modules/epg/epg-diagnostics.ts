import type { DiagnosticFailureKind } from "@tv-dash/shared";

export interface EpgFailureClassification {
  failureKind: DiagnosticFailureKind;
  message: string;
  retryable: boolean;
  statusCode: number | null;
}

function parseStatusCode(message: string) {
  const match = message.match(/(\d{3})$/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyEpgFailure(error: unknown): EpgFailureClassification {
  if (error instanceof Error && error.name === "AbortError") {
    return {
      failureKind: "epg-fetch",
      message: "EPG upstream request timed out",
      retryable: true,
      statusCode: null,
    };
  }

  const message = error instanceof Error ? error.message : "Unknown EPG failure";

  if (message.startsWith("EPG upstream returned")) {
    const statusCode = parseStatusCode(message);
    return {
      failureKind: "epg-fetch",
      message,
      retryable: statusCode ? statusCode >= 500 || statusCode === 429 : false,
      statusCode,
    };
  }

  if (message.startsWith("Invalid XMLTV")) {
    return {
      failureKind: "epg-parse",
      message,
      retryable: false,
      statusCode: null,
    };
  }

  if (error instanceof TypeError) {
    return {
      failureKind: "epg-fetch",
      message,
      retryable: true,
      statusCode: null,
    };
  }

  return {
    failureKind: "unknown",
    message,
    retryable: false,
    statusCode: null,
  };
}
