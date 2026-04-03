import { describe, expect, it } from "vitest";
import { buildRecordingFfmpegArgs } from "./recording-ffmpeg.js";

describe("recording-ffmpeg", () => {
  it("maps a single playable video and audio stream for live HLS recordings", () => {
    const args = buildRecordingFfmpegArgs(
      {
        sourceUrl: "https://example.com/live/master.m3u8",
        ffmpegInputArgs: ["-user_agent", "TV-Dash Recorder/1.0"],
      },
      "/tmp/recording.mp4",
    );

    expect(args).toEqual([
      "-hide_banner",
      "-loglevel",
      "warning",
      "-y",
      "-probesize",
      "10000000",
      "-analyzeduration",
      "10000000",
      "-ignore_unknown",
      "-user_agent",
      "TV-Dash Recorder/1.0",
      "-i",
      "https://example.com/live/master.m3u8",
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
      "-sn",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "/tmp/recording.mp4",
    ]);
  });
});
