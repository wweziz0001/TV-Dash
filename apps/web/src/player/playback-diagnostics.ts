import type { PlayerFailureKind, PlayerStatus } from "./playback-recovery";

export type PlayerPictureInPictureMode = "none" | "native";

export interface PlayerDiagnostics {
  status: PlayerStatus;
  label: string;
  summary: string;
  technicalDetail: string | null;
  failureKind: PlayerFailureKind | null;
  recoveryState: "none" | "recovering" | "recovered";
  isMuted: boolean;
  isPaused: boolean;
  volume: number;
  isPictureInPictureActive: boolean;
  pictureInPictureMode: PlayerPictureInPictureMode;
  isFullscreenActive: boolean;
  canPictureInPicture: boolean;
  canSeek: boolean;
  isAtLiveEdge: boolean;
  liveLatencySeconds: number | null;
  timeshiftSupported: boolean;
  timeshiftAvailable: boolean;
  timeshiftBufferState: "DISABLED" | "UNSUPPORTED" | "STARTING" | "WARMING" | "READY" | "ERROR";
  timeshiftAvailableWindowSeconds: number;
  timeshiftMessage: string | null;
}

interface BuildPlayerDiagnosticsOptions {
  status: PlayerStatus;
  statusDetail?: string | null;
  error?: string | null;
  failureKind?: PlayerFailureKind | null;
  recoveryNotice?: string | null;
  muted?: boolean;
  isPaused?: boolean;
  volume?: number;
  isPictureInPictureActive?: boolean;
  pictureInPictureMode?: PlayerPictureInPictureMode;
  isFullscreenActive?: boolean;
  canPictureInPicture?: boolean;
  canSeek?: boolean;
  isAtLiveEdge?: boolean;
  liveLatencySeconds?: number | null;
  timeshiftSupported?: boolean;
  timeshiftAvailable?: boolean;
  timeshiftBufferState?: "DISABLED" | "UNSUPPORTED" | "STARTING" | "WARMING" | "READY" | "ERROR";
  timeshiftAvailableWindowSeconds?: number;
  timeshiftMessage?: string | null;
}

function getStatusLabel(status: PlayerStatus, recoveryNotice: string | null, isPaused: boolean) {
  if (isPaused) {
    return "Paused";
  }

  if (status === "playing" && recoveryNotice) {
    return "Recovered";
  }

  switch (status) {
    case "idle":
      return "Idle";
    case "loading":
      return "Loading";
    case "buffering":
      return "Buffering";
    case "retrying":
      return "Retrying";
    case "playing":
      return "Live";
    case "error":
      return "Failed";
    default:
      return "Unknown";
  }
}

export function buildPlayerDiagnostics({
  status,
  statusDetail = null,
  error = null,
  failureKind = null,
  recoveryNotice = null,
  muted = true,
  isPaused = false,
  volume = 1,
  isPictureInPictureActive = false,
  pictureInPictureMode = "none",
  isFullscreenActive = false,
  canPictureInPicture = false,
  canSeek = false,
  isAtLiveEdge = true,
  liveLatencySeconds = null,
  timeshiftSupported = false,
  timeshiftAvailable = false,
  timeshiftBufferState = "DISABLED",
  timeshiftAvailableWindowSeconds = 0,
  timeshiftMessage = null,
}: BuildPlayerDiagnosticsOptions): PlayerDiagnostics {
  const label = getStatusLabel(status, recoveryNotice, isPaused);
  const recoveryState =
    recoveryNotice ? "recovered" : status === "retrying" ? "recovering" : "none";

  if (status === "error") {
    return {
      status,
      label,
      summary: error ?? "Playback failed.",
      technicalDetail: failureKind ? `Failure class: ${failureKind}` : null,
      failureKind,
      recoveryState,
      isMuted: muted,
      isPaused,
      volume,
      isPictureInPictureActive,
      pictureInPictureMode,
      isFullscreenActive,
      canPictureInPicture,
      canSeek,
      isAtLiveEdge,
      liveLatencySeconds,
      timeshiftSupported,
      timeshiftAvailable,
      timeshiftBufferState,
      timeshiftAvailableWindowSeconds,
      timeshiftMessage,
    };
  }

  if (isPaused) {
    return {
      status,
      label,
      summary: "Playback is paused inside the live DVR window.",
      technicalDetail: canSeek ? "Seek controls are available while paused." : null,
      failureKind,
      recoveryState,
      isMuted: muted,
      isPaused,
      volume,
      isPictureInPictureActive,
      pictureInPictureMode,
      isFullscreenActive,
      canPictureInPicture,
      canSeek,
      isAtLiveEdge,
      liveLatencySeconds,
      timeshiftSupported,
      timeshiftAvailable,
      timeshiftBufferState,
      timeshiftAvailableWindowSeconds,
      timeshiftMessage,
    };
  }

  if (status === "playing") {
    const liveSummary = canSeek
      ? isAtLiveEdge
        ? "Live playback is at the live edge."
        : `Playback is ${Math.round(liveLatencySeconds ?? 0)} seconds behind live inside the DVR window.`
      : muted
        ? "Live playback is stable and muted."
        : "Live playback is stable.";

    return {
      status,
      label,
      summary:
        recoveryNotice ??
        (!timeshiftSupported
          ? liveSummary
          : !timeshiftAvailable
            ? timeshiftMessage ?? "Timeshift buffer is warming up."
            : liveSummary),
      technicalDetail: null,
      failureKind,
      recoveryState,
      isMuted: muted,
      isPaused,
      volume,
      isPictureInPictureActive,
      pictureInPictureMode,
      isFullscreenActive,
      canPictureInPicture,
      canSeek,
      isAtLiveEdge,
      liveLatencySeconds,
      timeshiftSupported,
      timeshiftAvailable,
      timeshiftBufferState,
      timeshiftAvailableWindowSeconds,
      timeshiftMessage,
    };
  }

  return {
    status,
    label,
    summary:
      statusDetail ??
      (status === "idle"
        ? "Waiting for a channel assignment."
        : status === "retrying"
          ? "Retrying stream connection."
          : status === "buffering"
            ? "Buffering live stream."
            : "Loading stream."),
    technicalDetail: failureKind ? `Failure class: ${failureKind}` : null,
    failureKind,
    recoveryState,
    isMuted: muted,
    isPaused,
    volume,
    isPictureInPictureActive,
    pictureInPictureMode,
    isFullscreenActive,
    canPictureInPicture,
    canSeek,
    isAtLiveEdge,
    liveLatencySeconds,
    timeshiftSupported,
    timeshiftAvailable,
    timeshiftBufferState,
    timeshiftAvailableWindowSeconds,
    timeshiftMessage,
  };
}

export function getPlaybackTone(diagnostics: Pick<PlayerDiagnostics, "status" | "recoveryState" | "isPaused">) {
  if (diagnostics.isPaused) {
    return "neutral";
  }

  if (diagnostics.recoveryState === "recovered") {
    return "success";
  }

  if (diagnostics.status === "error") {
    return "danger";
  }

  if (diagnostics.status === "retrying" || diagnostics.status === "buffering" || diagnostics.status === "loading") {
    return "warning";
  }

  if (diagnostics.status === "playing") {
    return "success";
  }

  return "neutral";
}
