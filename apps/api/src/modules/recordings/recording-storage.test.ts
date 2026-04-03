import { beforeEach, describe, expect, it } from "vitest";
import {
  buildRecordingStoragePath,
  formatRecordingFileSize,
  getRecordingContainerFormat,
  getRecordingMimeType,
  isPlayableRecordingOutput,
  parseRecordingMediaProbe,
  resolveRecordingAbsolutePath,
} from "./recording-storage.js";

describe("recording-storage", () => {
  beforeEach(() => {
    expect(getRecordingContainerFormat()).toBe("mp4");
    expect(getRecordingMimeType()).toBe("video/mp4");
  });

  it("builds a dated storage path with sanitized channel and title segments", () => {
    const output = buildRecordingStoragePath({
      channelSlug: "TV Dash Live",
      title: "Prime Time / Headline Hour",
      startAt: new Date("2026-04-03T18:05:00.000Z"),
      recordingJobId: "11111111-1111-1111-1111-111111111111",
    });

    expect(output.storagePath).toMatch(/^2026\/04\/03\/20260403-180500Z-tv-dash-live-prime-time-headline-hour-11111111\.mp4$/);
  });

  it("keeps resolved paths rooted inside the configured storage directory", () => {
    const absolutePath = resolveRecordingAbsolutePath("2026/04/03/example.mp4");
    expect(absolutePath).toContain("/recordings/");
  });

  it("rejects storage paths that attempt to escape the storage root", () => {
    expect(() => resolveRecordingAbsolutePath("../escape.mp4")).toThrow(
      "Recording storage path escapes configured storage root",
    );
  });

  it("parses ffprobe output and captures media duration from audio/video streams", () => {
    const probe = parseRecordingMediaProbe(
      JSON.stringify({
        format: {
          duration: "44.312500",
        },
        streams: [
          { codec_type: "video", duration: "44.200000" },
          { codec_type: "audio", duration: "44.312500" },
        ],
      }),
    );

    expect(probe.streamCount).toBe(2);
    expect(probe.durationSeconds).toBeCloseTo(44.3125);
  });

  it("rejects tiny or streamless outputs and formats byte-sized files honestly", () => {
    expect(isPlayableRecordingOutput({ fileSizeBytes: 512, streamCount: 2 })).toBe(false);
    expect(isPlayableRecordingOutput({ fileSizeBytes: 4096, streamCount: 0 })).toBe(false);
    expect(isPlayableRecordingOutput({ fileSizeBytes: 4096, streamCount: 2 })).toBe(true);
    expect(formatRecordingFileSize(512)).toBe("512 B");
  });
});
