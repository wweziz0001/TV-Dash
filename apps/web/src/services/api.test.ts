import { describe, expect, it } from "vitest";
import { getChannelPlaybackUrl } from "./api";

describe("getChannelPlaybackUrl", () => {
  it("returns the direct upstream URL for direct channels", () => {
    expect(
      getChannelPlaybackUrl({
        id: "11111111-1111-1111-1111-111111111111",
        masterHlsUrl: "https://example.com/live.m3u8",
        playbackMode: "DIRECT",
      }),
    ).toBe("https://example.com/live.m3u8");
  });

  it("returns the API proxy master path for proxied channels", () => {
    expect(
      getChannelPlaybackUrl({
        id: "11111111-1111-1111-1111-111111111111",
        masterHlsUrl: null,
        playbackMode: "PROXY",
      }),
    ).toContain("/streams/channels/11111111-1111-1111-1111-111111111111/master");
  });
});
