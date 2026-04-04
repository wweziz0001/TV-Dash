import { describe, expect, it } from "vitest";
import { getChannelPlaybackUrl, resolveApiUrl } from "./api";

describe("getChannelPlaybackUrl", () => {
  it("returns the direct upstream URL for direct channels", () => {
    expect(
      getChannelPlaybackUrl({
        id: "11111111-1111-1111-1111-111111111111",
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: "https://example.com/live.m3u8",
        playbackMode: "DIRECT",
      }),
    ).toBe("https://example.com/live.m3u8");
  });

  it("returns the API proxy master path for proxied channels", () => {
    expect(
      getChannelPlaybackUrl({
        id: "11111111-1111-1111-1111-111111111111",
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: null,
        playbackMode: "PROXY",
      }),
    ).toContain("/streams/channels/11111111-1111-1111-1111-111111111111/master");
  });

  it("can prefer the API proxy path even for direct channels", () => {
    expect(
      getChannelPlaybackUrl(
        {
          id: "11111111-1111-1111-1111-111111111111",
          sourceMode: "MASTER_PLAYLIST",
          masterHlsUrl: "https://example.com/live.m3u8",
          playbackMode: "DIRECT",
        },
        { preferProxy: true },
      ),
    ).toContain("/streams/channels/11111111-1111-1111-1111-111111111111/master");
  });

  it("uses the API master path for manual-variant channels", () => {
    expect(
      getChannelPlaybackUrl({
        id: "11111111-1111-1111-1111-111111111111",
        sourceMode: "MANUAL_VARIANTS",
        masterHlsUrl: null,
        playbackMode: "DIRECT",
      }),
    ).toContain("/streams/channels/11111111-1111-1111-1111-111111111111/master");
  });

  it("prefers the timeshift master path when the channel has real DVR support configured", () => {
    expect(
      getChannelPlaybackUrl({
        id: "11111111-1111-1111-1111-111111111111",
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: null,
        playbackMode: "PROXY",
        timeshiftEnabled: true,
      }),
    ).toContain("/streams/channels/11111111-1111-1111-1111-111111111111/timeshift/master");
  });

  it("resolves relative API paths against the configured API origin", () => {
    expect(resolveApiUrl("/api/recordings/job-1/media?token=abc")).toContain("/api/recordings/job-1/media?token=abc");
  });
});
