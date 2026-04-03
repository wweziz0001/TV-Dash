import type { RecordingInputConfig } from "./recording-input.js";

export function buildRecordingFfmpegArgs(inputConfig: RecordingInputConfig, outputPath: string) {
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
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-sn",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}
