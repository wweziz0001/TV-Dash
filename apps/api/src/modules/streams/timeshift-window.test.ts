import { describe, expect, it } from "vitest";
import {
  getAvailableTimeshiftWindowSeconds,
  getTimeshiftSegmentTimestampMs,
  partitionTimeshiftSegmentsByCutoff,
} from "./timeshift-window.js";

describe("timeshift-window", () => {
  it("prefers program date time when evaluating segment timestamps", () => {
    expect(
      getTimeshiftSegmentTimestampMs({
        durationSeconds: 6,
        programDateTime: "2026-04-04T18:00:00.000Z",
        capturedAtMs: Date.parse("2026-04-04T18:01:00.000Z"),
      }),
    ).toBe(Date.parse("2026-04-04T18:00:00.000Z"));
  });

  it("sums the retained DVR window in seconds", () => {
    expect(
      getAvailableTimeshiftWindowSeconds([
        {
          durationSeconds: 6,
          programDateTime: null,
          capturedAtMs: 1,
        },
        {
          durationSeconds: 6,
          programDateTime: null,
          capturedAtMs: 2,
        },
        {
          durationSeconds: 4,
          programDateTime: null,
          capturedAtMs: 3,
        },
      ]),
    ).toBe(16);
  });

  it("evicts only segments older than the rolling cutoff", () => {
    const result = partitionTimeshiftSegmentsByCutoff(
      [
        {
          durationSeconds: 6,
          programDateTime: "2026-04-04T17:00:00.000Z",
          capturedAtMs: 0,
        },
        {
          durationSeconds: 6,
          programDateTime: "2026-04-04T17:10:00.000Z",
          capturedAtMs: 0,
        },
        {
          durationSeconds: 6,
          programDateTime: null,
          capturedAtMs: Date.parse("2026-04-04T17:20:00.000Z"),
        },
      ],
      Date.parse("2026-04-04T17:05:00.000Z"),
    );

    expect(result.evicted).toHaveLength(1);
    expect(result.retained).toHaveLength(2);
  });
});
