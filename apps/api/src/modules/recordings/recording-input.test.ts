import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(async () => {
    vi.unstubAllGlobals();
  });

  it("builds a temporary single-variant master input for master-playlist channels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Main",DEFAULT=YES,AUTOSELECT=YES,URI="audio/chunks.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,AUDIO="aac"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720,AUDIO="aac"
mid/index.m3u8`),
      }),
    );

    const config = await buildRecordingInputConfig(
      buildChannel({
        upstreamUserAgent: "TV-Dash Recorder/1.0",
        upstreamReferrer: "https://origin.example.com/",
        upstreamHeaders: {
          "x-test-token": "abc123",
        },
      }),
      4000,
      "1",
    );

    expect(config.temporaryFilePath).toBeTruthy();
    expect(config.sourceUrl).toBe(config.temporaryFilePath);
    expect(config.ffmpegInputArgs).toEqual([
      "-allowed_extensions",
      "ALL",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto,data",
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_on_network_error",
      "1",
      "-reconnect_delay_max",
      "2",
      "-user_agent",
      "TV-Dash Recorder/1.0",
      "-referer",
      "https://origin.example.com/",
      "-headers",
      "x-test-token: abc123\r\n",
    ]);
    expect(await fs.readFile(config.sourceUrl, "utf8")).toContain("https://example.com/live/mid/index.m3u8");
    await fs.rm(config.sourceUrl, { force: true });
  });

  it("uses the selected manual-variant playlist directly", async () => {
    const config = await buildRecordingInputConfig(
      buildChannel({
        sourceMode: "MANUAL_VARIANTS",
        masterHlsUrl: null,
        qualityVariants: [
          {
            id: "variant-low",
            channelId: "11111111-1111-1111-1111-111111111111",
            label: "360p",
            sortOrder: 0,
            playlistUrl: "https://example.com/360.m3u8",
            width: 640,
            height: 360,
            bandwidth: 800000,
            codecs: null,
            isActive: true,
            createdAt: new Date("2026-04-03T10:00:00.000Z"),
            updatedAt: new Date("2026-04-03T10:00:00.000Z"),
          },
          {
            id: "variant-high",
            channelId: "11111111-1111-1111-1111-111111111111",
            label: "720p",
            sortOrder: 1,
            playlistUrl: "https://example.com/720.m3u8",
            width: 1280,
            height: 720,
            bandwidth: 1400000,
            codecs: null,
            isActive: true,
            createdAt: new Date("2026-04-03T10:00:00.000Z"),
            updatedAt: new Date("2026-04-03T10:00:00.000Z"),
          },
        ],
      }),
      4000,
      "1",
    );

    expect(config.sourceUrl).toBe("https://example.com/720.m3u8");
    expect(config.temporaryFilePath).toBeNull();
    expect(config.ffmpegInputArgs).toEqual([
      "-allowed_extensions",
      "ALL",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto,data",
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_on_network_error",
      "1",
      "-reconnect_delay_max",
      "2",
    ]);
  });
});
