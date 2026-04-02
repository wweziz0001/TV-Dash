import { describe, expect, it } from "vitest";
import { parseMasterPlaylist } from "./playlist-parser.js";

describe("parseMasterPlaylist", () => {
  it("extracts variants from an HLS master playlist", () => {
    const playlist = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720
mid/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1920x1080
high/index.m3u8`;

    const result = parseMasterPlaylist(playlist);

    expect(result.isMasterPlaylist).toBe(true);
    expect(result.variantCount).toBe(3);
    expect(result.variants).toEqual([
      { label: "360p", height: 360, bandwidth: 800000 },
      { label: "720p", height: 720, bandwidth: 1400000 },
      { label: "1080p", height: 1080, bandwidth: 2800000 },
    ]);
  });

  it("treats media playlists as non-master playlists", () => {
    const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6,
segment-1.ts`;

    const result = parseMasterPlaylist(playlist);

    expect(result.isMasterPlaylist).toBe(false);
    expect(result.variantCount).toBe(0);
    expect(result.variants).toEqual([]);
  });
});
