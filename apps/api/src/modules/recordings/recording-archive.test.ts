import { describe, expect, it } from "vitest";
import { resolveRecordingArchiveContext } from "./recording-archive.js";

describe("recording-archive", () => {
  it("treats a completed guide-linked recording as an archived programme when DVR coverage still exists", () => {
    const context = resolveRecordingArchiveContext({
      recording: {
        id: "recording-1",
        status: "COMPLETED",
        title: "Morning Brief",
        programEntryId: "program-1",
        programStartAt: new Date("2026-04-05T08:00:00.000Z"),
        programEndAt: new Date("2026-04-05T09:00:00.000Z"),
        startAt: new Date("2026-04-05T07:58:00.000Z"),
        endAt: new Date("2026-04-05T09:02:00.000Z"),
        actualStartAt: new Date("2026-04-05T07:58:00.000Z"),
        actualEndAt: new Date("2026-04-05T09:02:00.000Z"),
        programEntry: {
          id: "program-1",
          startAt: new Date("2026-04-05T08:00:00.000Z"),
          endAt: new Date("2026-04-05T09:00:00.000Z"),
        },
        asset: {
          startedAt: new Date("2026-04-05T07:58:00.000Z"),
          endedAt: new Date("2026-04-05T09:02:00.000Z"),
        },
      },
      now: new Date("2026-04-05T10:00:00.000Z"),
      timeshiftWindow: {
        availableFromAt: new Date("2026-04-05T07:30:00.000Z"),
        availableUntilAt: new Date("2026-04-05T10:00:00.000Z"),
      },
    });

    expect(context).toMatchObject({
      programId: "program-1",
      hasProgramLink: true,
      catchup: {
        archiveStatus: "AIRED_ARCHIVED",
        hasRecordingSource: true,
        hasTimeshiftSource: true,
        preferredSourceType: "RECORDING",
      },
    });
  });

  it("falls back to the captured recording window when no linked programme survives", () => {
    const context = resolveRecordingArchiveContext({
      recording: {
        id: "recording-2",
        status: "COMPLETED",
        title: "Late Movie",
        programEntryId: null,
        programStartAt: null,
        programEndAt: null,
        startAt: new Date("2026-04-04T20:00:00.000Z"),
        endAt: new Date("2026-04-04T22:00:00.000Z"),
        actualStartAt: new Date("2026-04-04T20:00:00.000Z"),
        actualEndAt: new Date("2026-04-04T22:00:00.000Z"),
        programEntry: null,
        asset: {
          startedAt: new Date("2026-04-04T20:00:00.000Z"),
          endedAt: new Date("2026-04-04T22:00:00.000Z"),
        },
      },
      now: new Date("2026-04-05T10:00:00.000Z"),
      timeshiftWindow: null,
    });

    expect(context).toMatchObject({
      programId: null,
      hasProgramLink: false,
      startAt: "2026-04-04T20:00:00.000Z",
      endAt: "2026-04-04T22:00:00.000Z",
      catchup: {
        archiveStatus: "AIRED_RECORDED",
        hasRecordingSource: true,
        hasTimeshiftSource: false,
      },
    });
  });
});
