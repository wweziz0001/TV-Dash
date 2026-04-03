import type { DiagnosticFailureKind } from "@tv-dash/shared";
import Hls from "hls.js";

export type PlayerStatus = "idle" | "loading" | "buffering" | "playing" | "retrying" | "error";
export type PlayerFailureKind = DiagnosticFailureKind;

export interface RecoveryState {
  networkAttempts: number;
  mediaAttempts: number;
}

export type FatalRecoveryAction =
  | {
      kind: "retry-network";
      delayMs: number;
      networkAttempts: number;
      message: string;
      failureKind: PlayerFailureKind;
    }
  | {
      kind: "recover-media";
      mediaAttempts: number;
      message: string;
      failureKind: PlayerFailureKind;
    }
  | {
      kind: "fail";
      message: string;
      failureKind: PlayerFailureKind;
    };

const NETWORK_RETRY_DELAYS_MS = [1500, 3000, 5000];
const MAX_MEDIA_RECOVERY_ATTEMPTS = 1;

function describePlaybackError(details?: string | null): {
  message: string;
  failureKind: PlayerFailureKind;
} {
  switch (details) {
    case "manifestLoadError":
    case "manifestLoadTimeOut":
      return {
        message: "The stream manifest could not be loaded.",
        failureKind: "playlist-fetch",
      };
    case "manifestParsingError":
      return {
        message: "The stream manifest was received but could not be parsed.",
        failureKind: "invalid-playlist",
      };
    case "levelLoadError":
    case "levelLoadTimeOut":
    case "fragLoadError":
    case "fragLoadTimeOut":
      return {
        message: "A live stream request could not be completed.",
        failureKind: "network",
      };
    case "bufferAppendError":
      return {
        message: "The browser could not append new media data.",
        failureKind: "media-playback",
      };
    default:
      return {
        message: "The stream could not be recovered.",
        failureKind: "unknown",
      };
  }
}

export function getFatalRecoveryAction(
  errorType: string,
  errorDetails: string | undefined,
  recoveryState: RecoveryState,
): FatalRecoveryAction {
  if (errorType === Hls.ErrorTypes.NETWORK_ERROR) {
    const networkAttempts = recoveryState.networkAttempts + 1;
    const delayMs = NETWORK_RETRY_DELAYS_MS[networkAttempts - 1];

    if (delayMs) {
      return {
        kind: "retry-network",
        delayMs,
        networkAttempts,
        message: `Connection lost. Retrying stream startup (${networkAttempts}/${NETWORK_RETRY_DELAYS_MS.length}).`,
        failureKind: "network",
      };
    }
  }

  if (errorType === Hls.ErrorTypes.MEDIA_ERROR && recoveryState.mediaAttempts < MAX_MEDIA_RECOVERY_ATTEMPTS) {
    const mediaAttempts = recoveryState.mediaAttempts + 1;
    return {
      kind: "recover-media",
      mediaAttempts,
      message: `Playback stalled. Attempting browser media recovery (${mediaAttempts}/${MAX_MEDIA_RECOVERY_ATTEMPTS}).`,
      failureKind: "media-playback",
    };
  }

  const failure = describePlaybackError(errorDetails);

  return {
    kind: "fail",
    message: failure.message,
    failureKind: failure.failureKind,
  };
}
