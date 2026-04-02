import { describe, expect, it } from "vitest";
import { isPlaylistResponse, rewritePlaylist } from "./playlist-rewrite.js";

describe("rewritePlaylist", () => {
  it("rewrites nested playlists, segments, and key URIs against the upstream base URL", () => {
    const playlist = [
      "#EXTM3U",
      '#EXT-X-KEY:METHOD=AES-128,URI="keys/live.key"',
      "variant/high.m3u8",
      "#EXTINF:6.0,",
      "segments/chunk-1.ts",
    ].join("\n");

    const rewritten = rewritePlaylist(playlist, "https://origin.example.com/live/master.m3u8", (absoluteUrl) =>
      `/api/proxy?target=${encodeURIComponent(absoluteUrl)}`,
    );

    expect(rewritten).toContain(
      'URI="/api/proxy?target=https%3A%2F%2Forigin.example.com%2Flive%2Fkeys%2Flive.key"',
    );
    expect(rewritten).toContain("/api/proxy?target=https%3A%2F%2Forigin.example.com%2Flive%2Fvariant%2Fhigh.m3u8");
    expect(rewritten).toContain("/api/proxy?target=https%3A%2F%2Forigin.example.com%2Flive%2Fsegments%2Fchunk-1.ts");
  });
});

describe("isPlaylistResponse", () => {
  it("detects playlist responses by content type or URL", () => {
    expect(isPlaylistResponse("application/vnd.apple.mpegurl", "https://example.com/live")).toBe(true);
    expect(isPlaylistResponse(null, "https://example.com/live/master.m3u8")).toBe(true);
    expect(isPlaylistResponse("video/mp2t", "https://example.com/live/segment.ts")).toBe(false);
  });
});
