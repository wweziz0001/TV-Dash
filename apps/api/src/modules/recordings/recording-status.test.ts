import { describe, expect, it } from "vitest";
import { buildDefaultRecordingTitle, canCancelRecordingJob, canEditRecordingJob, canStopRecordingJob, resolveInitialRecordingJobStatus } from "./recording-status.js";

describe("recording-status", () => {
  it("marks immediate recordings as pending so the runtime can pick them up right away", () => {
    expect(
      resolveInitialRecordingJobStatus({
        channelId: "11111111-1111-1111-1111-111111111111",
        title: null,
        mode: "IMMEDIATE",
        startAt: null,
        endAt: null,
        programEntryId: null,
        requestedQualitySelector: null,
        requestedQualityLabel: null,
      }),
    ).toBe("PENDING");
  });

  it("marks future scheduled jobs as scheduled", () => {
    expect(
      resolveInitialRecordingJobStatus(
        {
          channelId: "11111111-1111-1111-1111-111111111111",
          title: null,
          mode: "SCHEDULED",
          startAt: "2026-04-04T10:00:00.000Z",
          endAt: "2026-04-04T11:00:00.000Z",
          programEntryId: null,
          requestedQualitySelector: null,
          requestedQualityLabel: null,
        },
        new Date("2026-04-03T10:00:00.000Z"),
      ),
    ).toBe("SCHEDULED");
  });

  it("keeps due-now timed jobs pending so they start on the next runtime tick", () => {
    expect(
      resolveInitialRecordingJobStatus(
        {
          channelId: "11111111-1111-1111-1111-111111111111",
          title: null,
          mode: "TIMED",
          startAt: "2026-04-03T10:00:00.000Z",
          endAt: "2026-04-03T11:00:00.000Z",
          programEntryId: null,
          requestedQualitySelector: null,
          requestedQualityLabel: null,
        },
        new Date("2026-04-03T10:00:00.000Z"),
      ),
    ).toBe("PENDING");
  });

  it("builds a practical default title with channel, mode, and UTC timestamp", () => {
    expect(
      buildDefaultRecordingTitle({
        channelName: "TV Dash Live",
        mode: "SCHEDULED",
        startAt: new Date("2026-04-03T18:05:00.000Z"),
      }),
    ).toContain("TV Dash Live");
  });

  it("enforces edit, cancel, and stop affordances on the expected statuses", () => {
    expect(canEditRecordingJob("PENDING")).toBe(true);
    expect(canEditRecordingJob("SCHEDULED")).toBe(true);
    expect(canEditRecordingJob("RECORDING")).toBe(false);
    expect(canCancelRecordingJob("SCHEDULED")).toBe(true);
    expect(canCancelRecordingJob("COMPLETED")).toBe(false);
    expect(canStopRecordingJob("RECORDING")).toBe(true);
    expect(canStopRecordingJob("FAILED")).toBe(false);
  });
});
