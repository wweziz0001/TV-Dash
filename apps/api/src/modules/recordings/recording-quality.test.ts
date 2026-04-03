import { describe, expect, it } from "vitest";
import type { StreamChannelRecord } from "../channels/channel.repository.js";
import { listRecordingQualityOptions, resolveRecordingVideoStreamIndex } from "./recording-quality.js";

function buildChannel(overrides: Partial<StreamChannelRecord> = {}): StreamChannelRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "TV Dash Live",
    slug: "tv-dash-live",
    isActive: true,
    sourceMode: "MANUAL_VARIANTS",
    masterHlsUrl: null,
    playbackMode: "PROXY",
    upstreamUserAgent: null,
    upstreamReferrer: null,
    upstreamHeaders: null,
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
    ...overrides,
  };
}

describe("recording-quality", () => {
  it("returns sorted quality options for manual-variant channels", async () => {
    const qualities = await listRecordingQualityOptions(buildChannel());

    expect(qualities).toEqual([
      { value: "AUTO", label: "Source default", height: null },
      { value: "1", label: "720p", height: 720 },
      { value: "0", label: "360p", height: 360 },
    ]);
  });

  it("resolves the requested recording stream index", () => {
    expect(resolveRecordingVideoStreamIndex(null)).toBe(0);
    expect(resolveRecordingVideoStreamIndex("AUTO")).toBe(0);
    expect(resolveRecordingVideoStreamIndex("2")).toBe(2);
    expect(resolveRecordingVideoStreamIndex("invalid")).toBe(0);
  });
});
