import { describe, expect, it } from "vitest";
import { buildRecordingFfmpegArgs } from "./recording-ffmpeg.js";

describe("recording-ffmpeg", () => {
  it("maps a single playable video and audio stream for live HLS recordings", () => {
    const args = buildRecordingFfmpegArgs(
      {
        sourceUrl: "https://example.com/live/master.m3u8",
        ffmpegInputArgs: ["-user_agent", "TV-Dash Recorder/1.0"],
        captureMode: "DIRECT",
      },
      "/tmp/recording.mp4",
      "2",
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
      "0:v:2?",
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

  it("stabilizes proxy captures with audio resync output settings", () => {
    const args = buildRecordingFfmpegArgs(
      {
        sourceUrl: "http://127.0.0.1:4000/api/streams/channels/channel-1/master",
        ffmpegInputArgs: ["-allowed_extensions", "ALL"],
        captureMode: "PROXY",
      },
      "/tmp/proxy-recording.mp4",
      "1",
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
      "-allowed_extensions",
      "ALL",
      "-i",
      "http://127.0.0.1:4000/api/streams/channels/channel-1/master",
      "-map",
      "0:v:1?",
      "-map",
      "0:a:0?",
      "-sn",
      "-max_interleave_delta",
      "0",
      "-avoid_negative_ts",
      "make_zero",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-af",
      "aresample=async=1:first_pts=0",
      "-movflags",
      "+faststart",
      "/tmp/proxy-recording.mp4",
    ]);
  });
});
