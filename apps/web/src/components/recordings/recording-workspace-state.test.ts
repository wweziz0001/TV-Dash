import { describe, expect, it } from "vitest";
import type { RecordingJob } from "@/types/api";
import { buildRecordingActivityEvents, splitRecordingWorkspaceJobs } from "./recording-workspace-state";

function createJob(overrides: Partial<RecordingJob> = {}): RecordingJob {
  return {
    id: overrides.id ?? "job-1",
    channelId: overrides.channelId ?? "channel-1",
    channelNameSnapshot: overrides.channelNameSnapshot ?? "TV Dash Live",
    channelSlugSnapshot: overrides.channelSlugSnapshot ?? "tv-dash-live",
    title: overrides.title ?? "Morning News",
    requestedQualitySelector: overrides.requestedQualitySelector ?? null,
    requestedQualityLabel: overrides.requestedQualityLabel ?? null,
    mode: overrides.mode ?? "IMMEDIATE",
    status: overrides.status ?? "COMPLETED",
    paddingBeforeMinutes: overrides.paddingBeforeMinutes ?? 0,
    paddingAfterMinutes: overrides.paddingAfterMinutes ?? 0,
    isProtected: overrides.isProtected ?? false,
    protectedAt: overrides.protectedAt ?? null,
    startAt: overrides.startAt ?? "2026-04-04T08:00:00.000Z",
    endAt: overrides.endAt ?? "2026-04-04T09:00:00.000Z",
    actualStartAt: overrides.actualStartAt ?? "2026-04-04T08:00:00.000Z",
    actualEndAt: overrides.actualEndAt ?? "2026-04-04T09:00:00.000Z",
    failureReason: overrides.failureReason ?? null,
    cancellationReason: overrides.cancellationReason ?? null,
    createdAt: overrides.createdAt ?? "2026-04-04T07:55:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-04T09:00:00.000Z",
    retention: overrides.retention ?? {
      isProtected: false,
      protectedAt: null,
      deleteAfter: "2026-05-04T09:00:00.000Z",
      mode: "STANDARD",
      maxAgeDays: 30,
      maxRecordingsPerChannel: 25,
      failedCleanupHours: 24,
    },
    program: overrides.program ?? null,
    recordingRule: overrides.recordingRule ?? null,
    channel: overrides.channel ?? null,
    createdByUser: overrides.createdByUser ?? null,
    latestRun: overrides.latestRun ?? null,
    asset: overrides.asset ?? null,
  };
}

describe("recording-workspace-state", () => {
  it("separates active and upcoming jobs for the top workspace section", () => {
    const groups = splitRecordingWorkspaceJobs([
      createJob({ id: "recording", status: "RECORDING" }),
      createJob({ id: "pending", status: "PENDING" }),
      createJob({ id: "scheduled", status: "SCHEDULED" }),
      createJob({ id: "completed", status: "COMPLETED" }),
    ]);

    expect(groups.activeJobs.map((job) => job.id)).toEqual(["recording"]);
    expect(groups.upcomingJobs.map((job) => job.id)).toEqual(["pending", "scheduled"]);
  });

  it("orders activity events by lifecycle timestamp and maps statuses to feed labels", () => {
    const events = buildRecordingActivityEvents([
      createJob({
        id: "scheduled",
        status: "SCHEDULED",
        updatedAt: "2026-04-04T08:30:00.000Z",
      }),
      createJob({
        id: "completed",
        status: "COMPLETED",
        actualEndAt: "2026-04-04T09:40:00.000Z",
        updatedAt: "2026-04-04T09:39:00.000Z",
        asset: {
          id: "asset-1",
          channelId: "channel-1",
          channelNameSnapshot: "TV Dash Live",
          channelSlugSnapshot: "tv-dash-live",
          title: "Morning News",
          fileName: "morning-news.mp4",
          mimeType: "video/mp4",
          containerFormat: "mp4",
          storagePath: "recordings/2026/04/04/morning-news.mp4",
          startedAt: "2026-04-04T08:00:00.000Z",
          endedAt: "2026-04-04T09:40:00.000Z",
          durationSeconds: 6000,
          fileSizeBytes: 123456789,
          thumbnailUrl: "/api/recordings/job-1/thumbnail",
          thumbnailMimeType: "image/jpeg",
          thumbnailGeneratedAt: "2026-04-04T09:41:00.000Z",
          playbackUrl: "/api/recordings/job-1/media",
          createdAt: "2026-04-04T09:40:00.000Z",
          updatedAt: "2026-04-04T09:41:00.000Z",
        },
      }),
      createJob({
        id: "failed",
        status: "FAILED",
        actualEndAt: "2026-04-04T09:55:00.000Z",
        failureReason: "Source dropped",
      }),
    ]);

    expect(events.map((event) => event.jobId)).toEqual(["failed", "completed", "scheduled"]);
    expect(events[0]).toMatchObject({
      label: "Recording failed",
      tone: "failure",
      detail: "Source dropped",
    });
    expect(events[1]).toMatchObject({
      label: "Recording completed",
      tone: "success",
      hasPlayback: true,
    });
    expect(events[2]).toMatchObject({
      label: "Recording scheduled",
      tone: "scheduled",
    });
  });
});
