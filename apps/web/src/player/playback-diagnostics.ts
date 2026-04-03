import type { PlayerFailureKind, PlayerStatus } from "./playback-recovery";

export interface PlayerDiagnostics {
  status: PlayerStatus;
  label: string;
  summary: string;
  technicalDetail: string | null;
  failureKind: PlayerFailureKind | null;
  recoveryState: "none" | "recovering" | "recovered";
  isMuted: boolean;
}

interface BuildPlayerDiagnosticsOptions {
  status: PlayerStatus;
  statusDetail?: string | null;
  error?: string | null;
  failureKind?: PlayerFailureKind | null;
  recoveryNotice?: string | null;
  muted?: boolean;
}

function getStatusLabel(status: PlayerStatus, recoveryNotice: string | null) {
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
}: BuildPlayerDiagnosticsOptions): PlayerDiagnostics {
  const label = getStatusLabel(status, recoveryNotice);
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
  };
}

export function getPlaybackTone(diagnostics: Pick<PlayerDiagnostics, "status" | "recoveryState">) {
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
