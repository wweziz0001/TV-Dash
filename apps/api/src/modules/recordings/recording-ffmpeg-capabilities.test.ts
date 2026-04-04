import { describe, expect, it } from "vitest";
import { parseFfmpegVersion, supportsFfmpegOption } from "./recording-ffmpeg-capabilities.js";

describe("recording-ffmpeg-capabilities", () => {
  it("parses the first ffmpeg version line from command output", () => {
    expect(
      parseFfmpegVersion(`ffmpeg version 5.1.8-0+deb12u1 Copyright (c) 2000-2025 the FFmpeg developers
built with gcc 12`),
    ).toBe("ffmpeg version 5.1.8-0+deb12u1 Copyright (c) 2000-2025 the FFmpeg developers");
  });

  it("detects whether a specific ffmpeg input option is supported by the current build", () => {
    const helpOutput = `  -allowed_extensions <string>     .D......... List of file extensions that hls is allowed to access
  -allowed_segment_extensions <string>     .D......... List of file extensions that hls is allowed to access
  -extension_picky   <boolean>    .D......... Be picky with all extensions matching`;

    expect(supportsFfmpegOption(helpOutput, "allowed_segment_extensions")).toBe(true);
    expect(supportsFfmpegOption(helpOutput, "extension_picky")).toBe(true);
    expect(supportsFfmpegOption(helpOutput, "protocol_whitelist")).toBe(false);
  });
});
