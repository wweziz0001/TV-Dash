import { describe, expect, it } from "vitest";
import { evaluateRecordingRetention } from "./recording-retention.js";

describe("recording-retention", () => {
  it("keeps protected recordings out of automatic cleanup", () => {
    const decisions = evaluateRecordingRetention(
      [
        {
          id: "job-1",
          channelId: "channel-1",
          status: "COMPLETED",
          isProtected: true,
          startAt: new Date("2026-04-01T10:00:00.000Z"),
          actualEndAt: new Date("2026-04-01T11:00:00.000Z"),
          createdAt: new Date("2026-04-01T09:55:00.000Z"),
          asset: {
            endedAt: new Date("2026-04-01T11:00:00.000Z"),
          },
        },
      ],
      new Date("2026-05-10T00:00:00.000Z"),
      {
        maxAgeDays: 30,
        maxRecordingsPerChannel: 2,
        failedCleanupHours: 24,
      },
    );

    expect(decisions).toEqual([]);
  });

  it("deletes completed recordings that exceed the age limit", () => {
    const decisions = evaluateRecordingRetention(
      [
        {
          id: "job-1",
          channelId: "channel-1",
          status: "COMPLETED",
          isProtected: false,
          startAt: new Date("2026-03-01T10:00:00.000Z"),
          actualEndAt: new Date("2026-03-01T11:00:00.000Z"),
          createdAt: new Date("2026-03-01T09:55:00.000Z"),
          asset: {
            endedAt: new Date("2026-03-01T11:00:00.000Z"),
          },
        },
      ],
      new Date("2026-04-10T00:00:00.000Z"),
      {
        maxAgeDays: 30,
        maxRecordingsPerChannel: 10,
        failedCleanupHours: 24,
      },
    );

    expect(decisions).toEqual([
      {
        jobId: "job-1",
        deleteReason: "AGE_LIMIT",
      },
    ]);
  });

  it("keeps only the newest configured number of completed recordings per channel", () => {
    const decisions = evaluateRecordingRetention(
      [
        {
          id: "job-1",
          channelId: "channel-1",
          status: "COMPLETED",
          isProtected: false,
          startAt: new Date("2026-04-03T10:00:00.000Z"),
          actualEndAt: new Date("2026-04-03T11:00:00.000Z"),
          createdAt: new Date("2026-04-03T09:55:00.000Z"),
          asset: {
            endedAt: new Date("2026-04-03T11:00:00.000Z"),
          },
        },
        {
          id: "job-2",
          channelId: "channel-1",
          status: "COMPLETED",
          isProtected: false,
          startAt: new Date("2026-04-02T10:00:00.000Z"),
          actualEndAt: new Date("2026-04-02T11:00:00.000Z"),
          createdAt: new Date("2026-04-02T09:55:00.000Z"),
          asset: {
            endedAt: new Date("2026-04-02T11:00:00.000Z"),
          },
        },
        {
          id: "job-3",
          channelId: "channel-1",
          status: "COMPLETED",
          isProtected: false,
          startAt: new Date("2026-04-01T10:00:00.000Z"),
          actualEndAt: new Date("2026-04-01T11:00:00.000Z"),
          createdAt: new Date("2026-04-01T09:55:00.000Z"),
          asset: {
            endedAt: new Date("2026-04-01T11:00:00.000Z"),
          },
        },
      ],
      new Date("2026-04-04T00:00:00.000Z"),
      {
        maxAgeDays: 30,
        maxRecordingsPerChannel: 2,
        failedCleanupHours: 24,
      },
    );

    expect(decisions).toEqual([
      {
        jobId: "job-3",
        deleteReason: "CHANNEL_LIMIT",
      },
    ]);
  });

  it("cleans up failed or canceled recordings after the shorter failure window", () => {
    const decisions = evaluateRecordingRetention(
      [
        {
          id: "job-1",
          channelId: "channel-1",
          status: "FAILED",
          isProtected: false,
          startAt: new Date("2026-04-01T10:00:00.000Z"),
          actualEndAt: new Date("2026-04-01T10:05:00.000Z"),
          createdAt: new Date("2026-04-01T09:55:00.000Z"),
          asset: null,
        },
      ],
      new Date("2026-04-02T12:00:00.000Z"),
      {
        maxAgeDays: 30,
        maxRecordingsPerChannel: 10,
        failedCleanupHours: 24,
      },
    );

    expect(decisions).toEqual([
      {
        jobId: "job-1",
        deleteReason: "FAILED_CLEANUP",
      },
    ]);
  });
});
