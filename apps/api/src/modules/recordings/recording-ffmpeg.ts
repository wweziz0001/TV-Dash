import type { RecordingInputConfig } from "./recording-input.js";
import { resolveRecordingVideoStreamIndex } from "./recording-quality.js";

export function buildRecordingFfmpegArgs(
  inputConfig: RecordingInputConfig,
  outputPath: string,
  requestedQualitySelector?: string | null,
) {
  const selectedVideoStreamIndex =
    inputConfig.captureMode === "PROXY" ? resolveRecordingVideoStreamIndex(requestedQualitySelector) : 0;
  const outputArgs =
    inputConfig.captureMode === "PROXY"
      ? [
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
        ]
      : ["-c", "copy"];

  return [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    "-probesize",
    "10000000",
    "-analyzeduration",
    "10000000",
    "-ignore_unknown",
    ...inputConfig.ffmpegInputArgs,
    "-i",
    inputConfig.sourceUrl,
    "-map",
    `0:v:${selectedVideoStreamIndex}?`,
    "-map",
    "0:a:0?",
    "-sn",
    ...outputArgs,
    "-movflags",
    "+faststart",
    outputPath,
  ];
}
