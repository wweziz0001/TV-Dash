import { describe, expect, it } from "vitest";
import { buildRecordingForm, createEmptyRecordingForm, validateRecordingForm } from "./recording-form-state";

describe("recording-form-state", () => {
  it("builds an immediate create payload without a required title", () => {
    const result = validateRecordingForm(
      createEmptyRecordingForm({
        channelId: "11111111-1111-1111-1111-111111111111",
        mode: "IMMEDIATE",
        requestedQualitySelector: "2",
      }),
      {
        mode: "create",
        qualityOptions: [
          { value: "AUTO", label: "Source default", height: null },
          { value: "2", label: "1080p", height: 1080 },
        ],
      },
    );

    expect(result.isValid).toBe(true);
    expect(result.createPayload).toMatchObject({
      mode: "IMMEDIATE",
      title: null,
      requestedQualitySelector: "2",
      requestedQualityLabel: "1080p",
    });
  });

  it("rejects scheduled recordings that do not start in the future", () => {
    const result = validateRecordingForm(
      createEmptyRecordingForm({
        channelId: "11111111-1111-1111-1111-111111111111",
        mode: "SCHEDULED",
        startAtLocal: "2026-04-03T09:00",
        endAtLocal: "2026-04-03T10:00",
      }),
      {
        mode: "create",
        now: new Date("2026-04-03T09:30:00.000Z"),
      },
    );

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.message).toContain("future");
  });

  it("builds an update payload for a valid reschedule", () => {
    const result = validateRecordingForm(
      createEmptyRecordingForm({
        channelId: "11111111-1111-1111-1111-111111111111",
        mode: "TIMED",
        title: "Prime block",
        requestedQualitySelector: "1",
        startAtLocal: "2026-04-03T10:00",
        endAtLocal: "2026-04-03T11:00",
      }),
      {
        mode: "update",
        now: new Date(2026, 3, 3, 9, 0, 0, 0),
        qualityOptions: [
          { value: "AUTO", label: "Source default", height: null },
          { value: "1", label: "720p", height: 720 },
        ],
      },
    );

    expect(result.isValid).toBe(true);
    expect(result.updatePayload).toMatchObject({
      title: "Prime block",
      requestedQualitySelector: "1",
      requestedQualityLabel: "720p",
      startAt: new Date(2026, 3, 3, 10, 0, 0, 0).toISOString(),
      endAt: new Date(2026, 3, 3, 11, 0, 0, 0).toISOString(),
    });
  });

  it("hydrates the form from a saved recording job", () => {
    const form = buildRecordingForm({
      id: "job-1",
      channelId: "11111111-1111-1111-1111-111111111111",
      channelNameSnapshot: "TV Dash Live",
      channelSlugSnapshot: "tv-dash-live",
      title: "TV Dash Live · Scheduled",
      requestedQualitySelector: "1",
      requestedQualityLabel: "720p",
      mode: "SCHEDULED",
      status: "SCHEDULED",
      startAt: "2026-04-03T10:00:00.000Z",
      endAt: "2026-04-03T11:00:00.000Z",
      actualStartAt: null,
      actualEndAt: null,
      failureReason: null,
      cancellationReason: null,
      createdAt: "2026-04-03T09:00:00.000Z",
      updatedAt: "2026-04-03T09:00:00.000Z",
      channel: null,
      createdByUser: null,
      latestRun: null,
      asset: null,
    });

    expect(form.mode).toBe("SCHEDULED");
    expect(form.requestedQualitySelector).toBe("1");
    expect(form.startAtLocal).toContain("2026-04-03T");
  });
});
