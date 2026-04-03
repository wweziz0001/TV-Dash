import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import { resolveRecordingRunProgress } from "./recording-progress.js";

const createdPaths = new Set<string>();

afterEach(async () => {
  await Promise.all([...createdPaths].map((targetPath) => fs.rm(targetPath, { force: true })));
  createdPaths.clear();
});

describe("recording-progress", () => {
  it("resolves live duration and file size for an active recording", async () => {
    const absolutePath = path.resolve(env.RECORDINGS_STORAGE_DIR, "tests/live-progress.mp4");
    createdPaths.add(absolutePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, Buffer.alloc(4096, 1));

    const progress = await resolveRecordingRunProgress({
      id: "job-1",
      channelId: "channel-1",
      channelNameSnapshot: "TV Dash Live",
      channelSlugSnapshot: "tv-dash-live",
      title: "Live Progress",
      mode: "IMMEDIATE",
      status: "RECORDING",
      startAt: new Date("2026-04-03T10:00:00.000Z"),
      endAt: null,
      actualStartAt: new Date(Date.now() - 12_000),
      actualEndAt: null,
      failureReason: null,
      cancellationReason: null,
      createdByUserId: "user-1",
      asset: null,
      channel: {
        id: "channel-1",
        name: "TV Dash Live",
        slug: "tv-dash-live",
        isActive: true,
      },
      runs: [
        {
          id: "run-1",
          recordingJobId: "job-1",
          status: "RECORDING",
          storagePath: "tests/live-progress.mp4",
          outputFileName: "live-progress.mp4",
          containerFormat: "mp4",
          ffmpegPid: 1234,
          startedAt: new Date(Date.now() - 11_000),
          endedAt: null,
          exitCode: null,
          exitSignal: null,
          failureReason: null,
          stderrTail: null,
          fileSizeBytes: null,
          durationSeconds: null,
          createdAt: new Date("2026-04-03T10:00:00.000Z"),
          updatedAt: new Date("2026-04-03T10:00:00.000Z"),
        },
      ],
    } as never);

    expect(progress).toMatchObject({
      id: "run-1",
      fileSizeBytes: 4096,
    });
    expect(progress?.durationSeconds).toBeGreaterThanOrEqual(10);
  });
});
