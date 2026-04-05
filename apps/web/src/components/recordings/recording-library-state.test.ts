import { describe, expect, it } from "vitest";
import {
  buildRecordingArchiveHref,
  buildRecordingLibrarySections,
  buildRecordingLibraryQueryParams,
  buildRecordingLibrarySummary,
  createDefaultRecordingLibraryFilters,
  filterRecordingLibraryJobs,
} from "./recording-library-state";

function buildRecordingJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    channelId: "channel-1",
    channelNameSnapshot: "TV Dash Live",
    channelSlugSnapshot: "tv-dash-live",
    title: "Morning News",
    requestedQualitySelector: null,
    requestedQualityLabel: null,
    mode: "IMMEDIATE" as const,
    status: "COMPLETED" as const,
    paddingBeforeMinutes: 0,
    paddingAfterMinutes: 0,
    isProtected: false,
    protectedAt: null,
    startAt: "2026-04-03T09:00:00.000Z",
    endAt: "2026-04-03T10:00:00.000Z",
    actualStartAt: "2026-04-03T09:00:00.000Z",
    actualEndAt: "2026-04-03T10:00:00.000Z",
    failureReason: null,
    cancellationReason: null,
    createdAt: "2026-04-03T08:55:00.000Z",
    updatedAt: "2026-04-03T10:00:00.000Z",
    retention: {
      isProtected: false,
      protectedAt: null,
      deleteAfter: "2026-05-03T10:00:00.000Z",
      mode: "STANDARD" as const,
      maxAgeDays: 30,
      maxRecordingsPerChannel: 25,
      failedCleanupHours: 24,
    },
    program: {
      id: "program-1",
      sourceKind: "IMPORTED" as const,
      title: "Morning News",
      description: null,
      category: "News",
      imageUrl: null,
      startAt: "2026-04-03T09:00:00.000Z",
      endAt: "2026-04-03T10:00:00.000Z",
    },
    recordingRule: null,
    channel: {
      id: "channel-1",
      name: "TV Dash Live",
      slug: "tv-dash-live",
      isActive: true,
    },
    createdByUser: null,
    archiveContext: {
      programId: "program-1",
      hasProgramLink: true,
      startAt: "2026-04-03T09:00:00.000Z",
      endAt: "2026-04-03T10:00:00.000Z",
      catchup: {
        timingState: "PREVIOUS" as const,
        playbackState: "PREVIOUS_RECORDING_AND_TIMESHIFT" as const,
        archiveStatus: "AIRED_ARCHIVED" as const,
        archiveAccess: "RECORDING_AND_TIMESHIFT" as const,
        hasRecordingSource: true,
        hasTimeshiftSource: true,
        isCatchupPlayable: true,
        watchFromStartAvailable: false,
        preferredSourceType: "RECORDING" as const,
        availableUntilAt: "2026-04-03T12:00:00.000Z",
        sources: [],
      },
    },
    latestRun: null,
    asset: null,
    ...overrides,
  };
}

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
      buildRecordingJob({
        isProtected: true,
        protectedAt: "2026-04-03T10:00:00.000Z",
        retention: {
          isProtected: true,
          protectedAt: "2026-04-03T10:00:00.000Z",
          deleteAfter: null,
          mode: "PROTECTED",
          maxAgeDays: 30,
          maxRecordingsPerChannel: 25,
          failedCleanupHours: 24,
        },
      }),
      buildRecordingJob({
        id: "job-2",
        channelId: "channel-2",
        channelNameSnapshot: "Headlines",
        channelSlugSnapshot: "headlines",
        title: "Failed Capture",
        mode: "TIMED",
        status: "FAILED",
        startAt: "2026-04-03T11:00:00.000Z",
        endAt: "2026-04-03T12:00:00.000Z",
        actualStartAt: null,
        actualEndAt: "2026-04-03T11:10:00.000Z",
        failureReason: "Source dropped",
        retention: {
          isProtected: false,
          protectedAt: null,
          deleteAfter: "2026-04-04T11:10:00.000Z",
          mode: "FAILED_CLEANUP",
          maxAgeDays: 30,
          maxRecordingsPerChannel: 25,
          failedCleanupHours: 24,
        },
        archiveContext: {
          programId: null,
          hasProgramLink: false,
          startAt: "2026-04-03T11:00:00.000Z",
          endAt: "2026-04-03T12:00:00.000Z",
          catchup: {
            timingState: "PREVIOUS",
            playbackState: "PREVIOUS_NOT_AVAILABLE",
            archiveStatus: "AIRED_UNAVAILABLE",
            archiveAccess: "NONE",
            hasRecordingSource: false,
            hasTimeshiftSource: false,
            isCatchupPlayable: false,
            watchFromStartAvailable: false,
            preferredSourceType: null,
            availableUntilAt: null,
            sources: [],
          },
        },
      }),
    ]);

    expect(summary).toEqual({
      total: 2,
      completed: 1,
      failed: 1,
      protectedCount: 1,
      catchupAvailableCount: 1,
      programLinkedCount: 1,
    });
  });

  it("filters archive-aware recordings locally for linked or catch-up-capable entries", () => {
    const jobs = [
      buildRecordingJob(),
      buildRecordingJob({
        id: "job-2",
        archiveContext: {
          programId: null,
          hasProgramLink: false,
          startAt: "2026-04-02T09:00:00.000Z",
          endAt: "2026-04-02T10:00:00.000Z",
          catchup: {
            timingState: "PREVIOUS",
            playbackState: "PREVIOUS_RECORDING",
            archiveStatus: "AIRED_RECORDED",
            archiveAccess: "RECORDING",
            hasRecordingSource: true,
            hasTimeshiftSource: false,
            isCatchupPlayable: true,
            watchFromStartAvailable: false,
            preferredSourceType: "RECORDING",
            availableUntilAt: null,
            sources: [],
          },
        },
      }),
    ];

    expect(filterRecordingLibraryJobs(jobs, "PROGRAM_LINKED")).toHaveLength(1);
    expect(filterRecordingLibraryJobs(jobs, "CATCHUP_AVAILABLE")).toHaveLength(1);
    expect(filterRecordingLibraryJobs(jobs, "RECORDING_ONLY")).toHaveLength(1);
  });

  it("groups archive-aware recordings by day and builds a channel archive href", () => {
    const jobs = [
      buildRecordingJob(),
      buildRecordingJob({
        id: "job-2",
        startAt: "2026-04-02T09:00:00.000Z",
        archiveContext: {
          programId: "program-2",
          hasProgramLink: true,
          startAt: "2026-04-02T09:00:00.000Z",
          endAt: "2026-04-02T10:00:00.000Z",
          catchup: {
            timingState: "PREVIOUS",
            playbackState: "PREVIOUS_RECORDING",
            archiveStatus: "AIRED_RECORDED",
            archiveAccess: "RECORDING",
            hasRecordingSource: true,
            hasTimeshiftSource: false,
            isCatchupPlayable: true,
            watchFromStartAvailable: false,
            preferredSourceType: "RECORDING",
            availableUntilAt: null,
            sources: [],
          },
        },
      }),
    ];

    const sections = buildRecordingLibrarySections(jobs, new Date("2026-04-03T12:00:00.000Z"));

    expect(sections).toHaveLength(2);
    expect(buildRecordingArchiveHref(jobs[0]!)).toBe("/watch/tv-dash-live?archiveDate=2026-04-03&programId=program-1");
  });
});
