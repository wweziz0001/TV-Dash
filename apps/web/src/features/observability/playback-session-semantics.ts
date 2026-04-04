import type { PlaybackPositionState, PlaybackSessionState } from "@tv-dash/shared";
import type { PlayerDiagnostics } from "@/player/hls-player";

export interface PlaybackSessionSemanticsSnapshot {
  playbackState: PlaybackSessionState;
  playbackPositionState: PlaybackPositionState;
  liveOffsetSeconds: number;
}

function getRoundedLiveOffsetSeconds(liveLatencySeconds: number | null) {
  const roundedOffset = Math.round(liveLatencySeconds ?? 0);
  return Math.max(1, roundedOffset);
}

export function buildPlaybackSessionSemantics(
  diagnostics: Pick<PlayerDiagnostics, "status" | "isPaused" | "timeshiftAvailable" | "isAtLiveEdge" | "liveLatencySeconds">,
): PlaybackSessionSemanticsSnapshot {
  const playbackState: PlaybackSessionState = diagnostics.isPaused ? "paused" : diagnostics.status;

  if (diagnostics.isPaused && diagnostics.timeshiftAvailable) {
    return {
      playbackState,
      playbackPositionState: "PAUSED",
      liveOffsetSeconds: getRoundedLiveOffsetSeconds(diagnostics.liveLatencySeconds),
    };
  }

  if (diagnostics.timeshiftAvailable && !diagnostics.isAtLiveEdge) {
    return {
      playbackState,
      playbackPositionState: "BEHIND_LIVE",
      liveOffsetSeconds: getRoundedLiveOffsetSeconds(diagnostics.liveLatencySeconds),
    };
  }

  return {
    playbackState,
    playbackPositionState: "LIVE_EDGE",
    liveOffsetSeconds: 0,
  };
}
