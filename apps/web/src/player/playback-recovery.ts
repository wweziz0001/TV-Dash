import Hls from "hls.js";

export type PlayerStatus = "idle" | "loading" | "buffering" | "playing" | "retrying" | "error";

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
    }
  | {
      kind: "recover-media";
      mediaAttempts: number;
      message: string;
    }
  | {
      kind: "fail";
      message: string;
    };

const NETWORK_RETRY_DELAYS_MS = [1500, 3000, 5000];
const MAX_MEDIA_RECOVERY_ATTEMPTS = 1;

function describePlaybackError(details?: string | null) {
  switch (details) {
    case "manifestLoadError":
      return "The stream manifest could not be loaded.";
    case "manifestParsingError":
      return "The stream manifest was received but could not be parsed.";
    case "levelLoadError":
      return "A quality variant could not be loaded.";
    case "fragLoadError":
      return "A media segment could not be downloaded.";
    case "bufferAppendError":
      return "The browser could not append new media data.";
    default:
      return "The stream could not be recovered.";
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
      };
    }
  }

  if (errorType === Hls.ErrorTypes.MEDIA_ERROR && recoveryState.mediaAttempts < MAX_MEDIA_RECOVERY_ATTEMPTS) {
    const mediaAttempts = recoveryState.mediaAttempts + 1;
    return {
      kind: "recover-media",
      mediaAttempts,
      message: `Playback stalled. Attempting browser media recovery (${mediaAttempts}/${MAX_MEDIA_RECOVERY_ATTEMPTS}).`,
    };
  }

  return {
    kind: "fail",
    message: describePlaybackError(errorDetails),
  };
}
