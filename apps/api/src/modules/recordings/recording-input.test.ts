import { describe, expect, it } from "vitest";
import type { StreamChannelRecord } from "../channels/channel.repository.js";
import { buildRecordingInputConfig } from "./recording-input.js";

function buildChannel(overrides: Partial<StreamChannelRecord> = {}): StreamChannelRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "TV Dash Live",
    slug: "tv-dash-live",
    isActive: true,
    sourceMode: "MASTER_PLAYLIST",
    masterHlsUrl: "https://example.com/live/master.m3u8",
    playbackMode: "DIRECT",
    upstreamUserAgent: null,
    upstreamReferrer: null,
    upstreamHeaders: null,
    qualityVariants: [],
    ...overrides,
  };
}

describe("recording-input", () => {
  it("uses the direct upstream URL for direct master-playlist channels", () => {
    const config = buildRecordingInputConfig(
      buildChannel({
        upstreamUserAgent: "TV-Dash Recorder/1.0",
        upstreamReferrer: "https://origin.example.com/",
        upstreamHeaders: {
          "x-test-token": "abc123",
        },
      }),
      4000,
    );

    expect(config.sourceUrl).toBe("https://example.com/live/master.m3u8");
    expect(config.ffmpegInputArgs).toEqual([
      "-user_agent",
      "TV-Dash Recorder/1.0",
      "-referer",
      "https://origin.example.com/",
      "-headers",
      "x-test-token: abc123\r\n",
    ]);
  });

  it("uses the internal API master for proxy channels", () => {
    const config = buildRecordingInputConfig(
      buildChannel({
        playbackMode: "PROXY",
      }),
      4000,
    );

    expect(config.sourceUrl).toBe("http://127.0.0.1:4000/api/streams/channels/11111111-1111-1111-1111-111111111111/master");
    expect(config.ffmpegInputArgs).toEqual([]);
  });

  it("uses the internal API master for manual-variant channels", () => {
    const config = buildRecordingInputConfig(
      buildChannel({
        sourceMode: "MANUAL_VARIANTS",
        masterHlsUrl: null,
      }),
      4000,
    );

    expect(config.sourceUrl).toBe("http://127.0.0.1:4000/api/streams/channels/11111111-1111-1111-1111-111111111111/master");
    expect(config.ffmpegInputArgs).toEqual([]);
  });
});
