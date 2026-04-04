import { describe, expect, it } from "vitest";
import { getChannelPlaybackTargets, getChannelPlaybackUrl, resolveApiUrl } from "./api";

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

  it("returns the shared local-delivery master path for shared channels", () => {
    expect(
      getChannelPlaybackUrl({
        id: "11111111-1111-1111-1111-111111111111",
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: null,
        playbackMode: "SHARED",
      }),
    ).toContain("/streams/channels/11111111-1111-1111-1111-111111111111/shared/master");
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

  it("keeps using the live proxy path while the retained DVR buffer is still unavailable", () => {
    expect(
      getChannelPlaybackUrl({
        id: "11111111-1111-1111-1111-111111111111",
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: null,
        playbackMode: "PROXY",
        timeshiftEnabled: true,
      }),
    ).toContain("/streams/channels/11111111-1111-1111-1111-111111111111/master");
  });

  it("prefers the timeshift master path once the retained DVR buffer is actually ready", () => {
    expect(
      getChannelPlaybackUrl(
        {
          id: "11111111-1111-1111-1111-111111111111",
          sourceMode: "MASTER_PLAYLIST",
          masterHlsUrl: null,
          playbackMode: "PROXY",
          timeshiftEnabled: true,
        },
        {
          timeshiftStatus: {
            available: true,
          },
        },
      ),
    ).toContain("/streams/channels/11111111-1111-1111-1111-111111111111/timeshift/master");
  });

  it("resolves relative API paths against the configured API origin", () => {
    expect(resolveApiUrl("/api/recordings/job-1/media?token=abc")).toContain("/api/recordings/job-1/media?token=abc");
  });
});

describe("getChannelPlaybackTargets", () => {
  it("exposes both live-edge and buffered playback paths for shared DVR sessions", () => {
    expect(
      getChannelPlaybackTargets(
        {
          id: "11111111-1111-1111-1111-111111111111",
          sourceMode: "MASTER_PLAYLIST",
          masterHlsUrl: null,
          playbackMode: "SHARED",
          timeshiftEnabled: true,
        },
        {
          sessionStatus: {
            livePlaybackUrl: "/api/streams/channels/11111111-1111-1111-1111-111111111111/shared/master",
            bufferedPlaybackUrl: "/api/streams/channels/11111111-1111-1111-1111-111111111111/timeshift/master",
            defaultPlaybackUrl: "/api/streams/channels/11111111-1111-1111-1111-111111111111/timeshift/master",
            timeshift: {
              channelId: "11111111-1111-1111-1111-111111111111",
              configured: true,
              supported: true,
              available: true,
              acquisitionMode: "SHARED_SESSION",
              bufferState: "READY",
              message: "Live DVR window is ready.",
              windowSeconds: 1800,
              minimumReadyWindowSeconds: 30,
              availableWindowSeconds: 60,
              bufferedSegmentCount: 10,
              lastUpdatedAt: "2026-04-04T00:00:00.000Z",
              lastError: null,
            },
          },
        },
      ),
    ).toEqual({
      livePlaybackUrl: "/api/streams/channels/11111111-1111-1111-1111-111111111111/shared/master",
      bufferedPlaybackUrl: "/api/streams/channels/11111111-1111-1111-1111-111111111111/timeshift/master",
      defaultPlaybackUrl: "/api/streams/channels/11111111-1111-1111-1111-111111111111/timeshift/master",
    });
  });
});
