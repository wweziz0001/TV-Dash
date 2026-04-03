import { afterEach, describe, expect, it, vi } from "vitest";
import type { StreamChannelRecord } from "../channels/channel.repository.js";
import { listRecordingQualityOptions, resolveRecordingSourceDescriptor } from "./recording-quality.js";

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns sorted quality options for manual-variant channels", async () => {
    const qualities = await listRecordingQualityOptions(buildChannel());

    expect(qualities).toEqual([
      { value: "AUTO", label: "Source default", height: null },
      { value: "1", label: "720p", height: 720 },
      { value: "0", label: "360p", height: 360 },
    ]);
  });

  it("builds a single-variant master playlist for master-playlist channels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Arabic",DEFAULT=YES,AUTOSELECT=YES,URI="audio/chunks.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,AUDIO="aac"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720,AUDIO="aac"
mid/index.m3u8`),
      }),
    );

    const descriptor = await resolveRecordingSourceDescriptor(
      buildChannel({
        sourceMode: "MASTER_PLAYLIST",
        playbackMode: "DIRECT",
        masterHlsUrl: "https://example.com/live/master.m3u8",
      }),
      "1",
    );

    expect(descriptor.sourceUrl).toBeNull();
    expect(descriptor.selectedQualityLabel).toBe("720p");
    expect(descriptor.singleVariantMasterPlaylist).toContain('URI="https://example.com/live/audio/chunks.m3u8"');
    expect(descriptor.singleVariantMasterPlaylist).toContain("https://example.com/live/mid/index.m3u8");
  });
});
