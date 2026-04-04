import { describe, expect, it } from "vitest";
import { buildPlaybackSessionSemantics } from "./playback-session-semantics";

describe("playback-session-semantics", () => {
  it("treats live-edge playback as a per-viewer live state", () => {
    expect(
      buildPlaybackSessionSemantics({
        status: "playing",
        isPaused: false,
        timeshiftAvailable: true,
        isAtLiveEdge: true,
        liveLatencySeconds: 0,
      }),
    ).toEqual({
      playbackState: "playing",
      playbackPositionState: "LIVE_EDGE",
      liveOffsetSeconds: 0,
    });
  });

  it("captures buffered playback behind live without affecting the live-edge state model", () => {
    expect(
      buildPlaybackSessionSemantics({
        status: "playing",
        isPaused: false,
        timeshiftAvailable: true,
        isAtLiveEdge: false,
        liveLatencySeconds: 23.8,
      }),
    ).toEqual({
      playbackState: "playing",
      playbackPositionState: "BEHIND_LIVE",
      liveOffsetSeconds: 24,
    });
  });

  it("keeps paused buffered playback distinct from active behind-live playback", () => {
    expect(
      buildPlaybackSessionSemantics({
        status: "playing",
        isPaused: true,
        timeshiftAvailable: true,
        isAtLiveEdge: false,
        liveLatencySeconds: 12.1,
      }),
    ).toEqual({
      playbackState: "paused",
      playbackPositionState: "PAUSED",
      liveOffsetSeconds: 12,
    });
  });
});
