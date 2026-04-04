import { describe, expect, it } from "vitest";
import {
  buildRecordingLibraryQueryParams,
  buildRecordingLibrarySummary,
  createDefaultRecordingLibraryFilters,
} from "./recording-library-state";

describe("recording-library-state", () => {
  it("builds query params for the richer library filters", () => {
    const params = buildRecordingLibraryQueryParams({
      ...createDefaultRecordingLibraryFilters(),
      search: "headline hour",
      status: "FAILED",
      channelId: "11111111-1111-1111-1111-111111111111",
      mode: "EPG_PROGRAM",
      protection: "PROTECTED",
      recordedFrom: "2026-04-01",
      recordedTo: "2026-04-03",
      sort: "TITLE_ASC",
    });

    expect(params.get("search")).toBe("headline hour");
    expect(params.get("status")).toBe("FAILED");
    expect(params.get("channelId")).toBe("11111111-1111-1111-1111-111111111111");
    expect(params.get("mode")).toBe("EPG_PROGRAM");
    expect(params.get("isProtected")).toBe("true");
    expect(params.get("sort")).toBe("TITLE_ASC");
    expect(params.get("recordedAfter")).not.toBeNull();
    expect(params.get("recordedBefore")).not.toBeNull();
  });

  it("defaults to the standard library statuses when all statuses are selected", () => {
    const params = buildRecordingLibraryQueryParams(createDefaultRecordingLibraryFilters());

    expect(params.get("status")).toBe("COMPLETED");
    expect(params.get("sort")).toBe("RECORDED_DESC");
  });

  it("summarizes protected, completed, and failed library counts", () => {
    const summary = buildRecordingLibrarySummary([
      {
        id: "job-1",
        channelId: "channel-1",
        channelNameSnapshot: "TV Dash Live",
        channelSlugSnapshot: "tv-dash-live",
        title: "Morning News",
        requestedQualitySelector: null,
        requestedQualityLabel: null,
        mode: "IMMEDIATE",
        status: "COMPLETED",
        paddingBeforeMinutes: 0,
        paddingAfterMinutes: 0,
        isProtected: true,
        protectedAt: "2026-04-03T10:00:00.000Z",
        startAt: "2026-04-03T09:00:00.000Z",
        endAt: "2026-04-03T10:00:00.000Z",
        actualStartAt: "2026-04-03T09:00:00.000Z",
        actualEndAt: "2026-04-03T10:00:00.000Z",
        failureReason: null,
        cancellationReason: null,
        createdAt: "2026-04-03T08:55:00.000Z",
        updatedAt: "2026-04-03T10:00:00.000Z",
        retention: {
          isProtected: true,
          protectedAt: "2026-04-03T10:00:00.000Z",
          deleteAfter: null,
          mode: "PROTECTED",
          maxAgeDays: 30,
          maxRecordingsPerChannel: 25,
          failedCleanupHours: 24,
        },
        program: null,
        recordingRule: null,
        channel: null,
        createdByUser: null,
        latestRun: null,
        asset: null,
      },
      {
        id: "job-2",
        channelId: "channel-2",
        channelNameSnapshot: "Headlines",
        channelSlugSnapshot: "headlines",
        title: "Failed Capture",
        requestedQualitySelector: null,
        requestedQualityLabel: null,
        mode: "TIMED",
        status: "FAILED",
        paddingBeforeMinutes: 0,
        paddingAfterMinutes: 0,
        isProtected: false,
        protectedAt: null,
        startAt: "2026-04-03T11:00:00.000Z",
        endAt: "2026-04-03T12:00:00.000Z",
        actualStartAt: null,
        actualEndAt: "2026-04-03T11:10:00.000Z",
        failureReason: "Source dropped",
        cancellationReason: null,
        createdAt: "2026-04-03T10:55:00.000Z",
        updatedAt: "2026-04-03T11:10:00.000Z",
        retention: {
          isProtected: false,
          protectedAt: null,
          deleteAfter: "2026-04-04T11:10:00.000Z",
          mode: "FAILED_CLEANUP",
          maxAgeDays: 30,
          maxRecordingsPerChannel: 25,
          failedCleanupHours: 24,
        },
        program: null,
        recordingRule: null,
        channel: null,
        createdByUser: null,
        latestRun: null,
        asset: null,
      },
    ]);

    expect(summary).toEqual({
      total: 2,
      completed: 1,
      failed: 1,
      protectedCount: 1,
    });
  });
});
