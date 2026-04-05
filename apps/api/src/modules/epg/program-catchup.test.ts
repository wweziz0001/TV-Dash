import { describe, expect, it } from "vitest";
import { resolveProgramCatchupSummary, selectPreferredRecordingCatchupCandidate } from "./program-catchup.js";

describe("program-catchup", () => {
  it("prefers a linked recording over a retained timeshift window for previous programmes", () => {
    const summary = resolveProgramCatchupSummary({
      program: {
        id: "program-1",
        startAt: new Date("2026-04-05T08:00:00.000Z"),
        endAt: new Date("2026-04-05T09:00:00.000Z"),
      },
      now: new Date("2026-04-05T10:00:00.000Z"),
      recordingCandidates: [
        {
          recordingJobId: "recording-1",
          programEntryId: "program-1",
          title: "Morning Brief",
          startsAt: new Date("2026-04-05T07:58:00.000Z"),
          endsAt: new Date("2026-04-05T09:02:00.000Z"),
        },
      ],
      timeshiftWindow: {
        availableFromAt: new Date("2026-04-05T07:30:00.000Z"),
        availableUntilAt: new Date("2026-04-05T10:00:00.000Z"),
      },
    });

    expect(summary.playbackState).toBe("PREVIOUS_RECORDING_AND_TIMESHIFT");
    expect(summary.preferredSourceType).toBe("RECORDING");
    expect(summary.sources[0]).toMatchObject({
      sourceType: "RECORDING",
      isPreferred: true,
      recordingMatchType: "LINKED",
    });
  });

  it("marks previous programmes as unavailable when no real playback source exists", () => {
    const summary = resolveProgramCatchupSummary({
      program: {
        id: "program-2",
        startAt: new Date("2026-04-05T05:00:00.000Z"),
        endAt: new Date("2026-04-05T06:00:00.000Z"),
      },
      now: new Date("2026-04-05T10:00:00.000Z"),
      recordingCandidates: [],
      timeshiftWindow: {
        availableFromAt: new Date("2026-04-05T08:30:00.000Z"),
        availableUntilAt: new Date("2026-04-05T10:00:00.000Z"),
      },
    });

    expect(summary.playbackState).toBe("PREVIOUS_NOT_AVAILABLE");
    expect(summary.isCatchupPlayable).toBe(false);
    expect(summary.sources).toEqual([]);
  });

  it("surfaces watch-from-start on the current programme when the retained window covers its start", () => {
    const summary = resolveProgramCatchupSummary({
      program: {
        id: "program-3",
        startAt: new Date("2026-04-05T09:30:00.000Z"),
        endAt: new Date("2026-04-05T10:30:00.000Z"),
      },
      now: new Date("2026-04-05T10:00:00.000Z"),
      recordingCandidates: [],
      timeshiftWindow: {
        availableFromAt: new Date("2026-04-05T09:20:00.000Z"),
        availableUntilAt: new Date("2026-04-05T10:00:00.000Z"),
      },
    });

    expect(summary.playbackState).toBe("LIVE_WATCH_FROM_START");
    expect(summary.watchFromStartAvailable).toBe(true);
    expect(summary.sources[0]).toMatchObject({
      sourceType: "TIMESHIFT",
      isPreferred: true,
    });
  });

  it("chooses the strongest recording coverage when no explicit guide-program link exists", () => {
    const candidate = selectPreferredRecordingCatchupCandidate(
      {
        id: "program-4",
        startAt: new Date("2026-04-05T11:00:00.000Z"),
        endAt: new Date("2026-04-05T12:00:00.000Z"),
      },
      [
        {
          recordingJobId: "recording-weak",
          programEntryId: null,
          title: "Partial overlap",
          startsAt: new Date("2026-04-05T11:15:00.000Z"),
          endsAt: new Date("2026-04-05T11:50:00.000Z"),
        },
        {
          recordingJobId: "recording-strong",
          programEntryId: null,
          title: "Strong overlap",
          startsAt: new Date("2026-04-05T10:59:30.000Z"),
          endsAt: new Date("2026-04-05T12:00:15.000Z"),
        },
      ],
    );

    expect(candidate).toMatchObject({
      candidate: {
        recordingJobId: "recording-strong",
      },
      matchType: "OVERLAP",
    });
  });
});

