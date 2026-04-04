import { describe, expect, it } from "vitest";
import { parseMediaPlaylist } from "./media-playlist.js";

describe("media-playlist", () => {
  it("parses live media playlists with sequence numbers and segment metadata", () => {
    const parsed = parseMediaPlaylist(
      `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:101
#EXTINF:6.0,
segment101.ts
#EXT-X-PROGRAM-DATE-TIME:2026-04-04T18:00:06.000Z
#EXTINF:6.0,
segment102.ts
`,
      "https://example.com/live/index.m3u8",
    );

    expect(parsed.targetDurationSeconds).toBe(6);
    expect(parsed.mediaSequence).toBe(101);
    expect(parsed.segments).toHaveLength(2);
    expect(parsed.segments[0]).toMatchObject({
      sequence: 101,
      durationSeconds: 6,
      absoluteUrl: "https://example.com/live/segment101.ts",
    });
    expect(parsed.segments[1]).toMatchObject({
      sequence: 102,
      programDateTime: "2026-04-04T18:00:06.000Z",
    });
  });
});
