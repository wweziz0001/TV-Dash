import type { PlayerFailureKind, PlayerStatus } from "./playback-recovery";

export type PlayerPictureInPictureMode = "none" | "native" | "floating" | "detached";

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
    };
  }

  if (isPaused) {
    return {
      status,
      label,
      summary: "Playback is paused. Resume when you want to return to the live edge.",
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
    };
  }

  if (status === "playing") {
    return {
      status,
      label,
      summary: recoveryNotice ?? (muted ? "Live playback is stable and muted." : "Live playback is stable."),
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
