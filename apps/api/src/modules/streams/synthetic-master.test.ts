import { describe, expect, it } from "vitest";
import { buildSyntheticMasterPlaylist } from "./synthetic-master.js";

describe("buildSyntheticMasterPlaylist", () => {
  it("builds a playable master playlist from manual quality variants", () => {
    const playlist = buildSyntheticMasterPlaylist([
      {
        label: "low",
        sortOrder: 0,
        playlistUrl: "https://example.com/live/low/index.m3u8",
        width: null,
        height: null,
        bandwidth: null,
        codecs: null,
      },
      {
        label: "1080p",
        sortOrder: 2,
        playlistUrl: "https://example.com/live/high/index.m3u8",
        width: null,
        height: null,
        bandwidth: null,
        codecs: 'avc1.640028,mp4a.40.2',
      },
      {
        label: "medium",
        sortOrder: 1,
        playlistUrl: "https://example.com/live/medium/index.m3u8",
        width: null,
        height: null,
        bandwidth: null,
        codecs: null,
      },
    ]);

    expect(playlist).toContain("#EXTM3U");
    expect(playlist).toContain('NAME="low"');
    expect(playlist).toContain("BANDWIDTH=800000");
    expect(playlist).toContain("RESOLUTION=640x360");
    expect(playlist).toContain("https://example.com/live/low/index.m3u8");
    expect(playlist).toContain('NAME="1080p"');
    expect(playlist).toContain("RESOLUTION=1920x1080");
    expect(playlist).toContain('CODECS="avc1.640028,mp4a.40.2"');
  });

  it("can rewrite manual variant URLs to proxy asset paths", () => {
    const playlist = buildSyntheticMasterPlaylist(
      [
        {
          label: "Backup",
          sortOrder: 0,
          playlistUrl: "https://example.com/live/backup/index.m3u8",
          width: null,
          height: null,
          bandwidth: null,
          codecs: null,
        },
      ],
      {
        rewriteUri: (url) => `/api/streams/channels/channel-1/asset?target=${encodeURIComponent(url)}`,
      },
    );

    expect(playlist).toContain("/api/streams/channels/channel-1/asset?target=https%3A%2F%2Fexample.com%2Flive%2Fbackup%2Findex.m3u8");
    expect(playlist).toContain("BANDWIDTH=800000");
  });
});
