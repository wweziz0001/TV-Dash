import { describe, expect, it } from "vitest";
import { getProgramCatchupBadges, getProgramCatchupCopy } from "./channel-program-catchup-state";

function buildProgram(playbackState: NonNullable<ReturnType<typeof buildCatchup>>["playbackState"]) {
  return {
    id: "program-1",
    sourceKind: "IMPORTED" as const,
    title: "Morning Brief",
    subtitle: null,
    description: null,
    category: "News",
    imageUrl: null,
    start: "2026-04-05T08:00:00.000Z",
    stop: "2026-04-05T09:00:00.000Z",
    catchup: buildCatchup(playbackState),
  };
}

function buildCatchup(playbackState: "LIVE_WATCH_FROM_START" | "PREVIOUS_RECORDING_AND_TIMESHIFT" | "PREVIOUS_NOT_AVAILABLE") {
  return {
    timingState: playbackState === "LIVE_WATCH_FROM_START" ? ("LIVE_NOW" as const) : ("PREVIOUS" as const),
    playbackState,
    isCatchupPlayable: playbackState !== "PREVIOUS_NOT_AVAILABLE",
    watchFromStartAvailable: playbackState === "LIVE_WATCH_FROM_START",
    preferredSourceType:
      playbackState === "PREVIOUS_NOT_AVAILABLE"
        ? null
        : playbackState === "PREVIOUS_RECORDING_AND_TIMESHIFT"
          ? ("RECORDING" as const)
          : ("TIMESHIFT" as const),
    availableUntilAt: "2026-04-05T10:00:00.000Z",
    sources: [],
  };
}

describe("channel-program-catchup-state", () => {
  it("labels live programmes that support watch-from-start honestly", () => {
    expect(getProgramCatchupBadges(buildProgram("LIVE_WATCH_FROM_START"))).toEqual([
      { label: "Live", tone: "live" },
      { label: "Watch from start", tone: "positive" },
      { label: "DVR window", tone: "warning" },
    ]);
  });

  it("surfaces both recording and DVR badges when both sources exist", () => {
    expect(getProgramCatchupBadges(buildProgram("PREVIOUS_RECORDING_AND_TIMESHIFT"))).toEqual([
      { label: "Earlier", tone: "neutral" },
      { label: "Recording", tone: "positive" },
      { label: "DVR window", tone: "warning" },
    ]);
    expect(getProgramCatchupCopy(buildProgram("PREVIOUS_RECORDING_AND_TIMESHIFT"))).toContain("Recording playback is preferred");
  });

  it("explains when earlier programmes are not actually playable", () => {
    expect(getProgramCatchupBadges(buildProgram("PREVIOUS_NOT_AVAILABLE"))).toEqual([
      { label: "Earlier", tone: "neutral" },
      { label: "Not available", tone: "neutral" },
    ]);
    expect(getProgramCatchupCopy(buildProgram("PREVIOUS_NOT_AVAILABLE"))).toContain("No linked recording");
  });
});

