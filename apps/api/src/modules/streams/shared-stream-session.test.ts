import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";

const mockGetChannelStreamDetails = vi.fn();

vi.mock("../channels/channel.service.js", () => ({
  getChannelStreamDetails: mockGetChannelStreamDetails,
}));

const {
  cleanupStaleSharedStreamSessions,
  clearSharedStreamSessionsForTests,
  getChannelSharedAssetResponse,
  getChannelSharedMasterResponse,
  getChannelSharedStreamStatus,
  listSharedStreamSessionSnapshots,
} = await import("./shared-stream-session.js");

function buildChannel(overrides: Partial<Awaited<ReturnType<typeof mockGetChannelStreamDetails>>> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Shared News",
    slug: "shared-news",
    isActive: true,
    sourceMode: "MASTER_PLAYLIST" as const,
    masterHlsUrl: "https://origin.example.com/live/master.m3u8",
    playbackMode: "SHARED" as const,
    timeshiftEnabled: false,
    timeshiftWindowMinutes: null,
    upstreamUserAgent: null,
    upstreamReferrer: null,
    upstreamHeaders: null,
    qualityVariants: [],
    ...overrides,
  };
}

describe("shared-stream-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetChannelStreamDetails.mockResolvedValue(buildChannel());
  });

  afterEach(() => {
    clearSharedStreamSessionsForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports an idle shared status before the first local viewer attaches", async () => {
    const status = await getChannelSharedStreamStatus("11111111-1111-1111-1111-111111111111");

    expect(status).toMatchObject({
      configured: true,
      enabled: true,
      active: false,
      upstreamState: "IDLE",
    });
  });

  it("creates a shared session, rewrites playlists, and reuses cached segment responses", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1800000\nvariant/high.m3u8\n"),
        headers: {
          get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue("#EXTM3U\n#EXTINF:4.0,\nsegment-001.ts\n"),
        headers: {
          get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("segment-bytes")),
        headers: {
          get: vi.fn().mockReturnValue("video/mp2t"),
        },
      });
    vi.stubGlobal("fetch", fetchSpy);

    const masterResponse = await getChannelSharedMasterResponse("11111111-1111-1111-1111-111111111111");
    const variantAssetId =
      masterResponse.body
        .toString()
        .match(/shared\/assets\/([a-z0-9-]+)/)?.[1] ?? null;

    expect(masterResponse.contentType).toBe("application/vnd.apple.mpegurl");
    expect(masterResponse.body.toString()).toContain("/shared/assets/");
    expect(variantAssetId).toBeTruthy();

    const variantResponse = await getChannelSharedAssetResponse(
      "11111111-1111-1111-1111-111111111111",
      variantAssetId ?? "",
    );
    const segmentAssetId =
      variantResponse.body
        .toString()
        .match(/shared\/assets\/([a-z0-9-]+)/)?.[1] ?? null;

    expect(variantResponse.body.toString()).toContain("/shared/assets/");
    expect(segmentAssetId).toBeTruthy();

    const firstSegment = await getChannelSharedAssetResponse(
      "11111111-1111-1111-1111-111111111111",
      segmentAssetId ?? "",
    );
    const secondSegment = await getChannelSharedAssetResponse(
      "11111111-1111-1111-1111-111111111111",
      segmentAssetId ?? "",
    );

    expect(firstSegment.body).toEqual(Buffer.from("segment-bytes"));
    expect(secondSegment.body).toEqual(Buffer.from("segment-bytes"));
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const session = listSharedStreamSessionSnapshots()[0];
    expect(session).toMatchObject({
      channelId: "11111111-1111-1111-1111-111111111111",
      upstreamState: "ACTIVE",
    });
    expect(session?.cache.segmentHitCount).toBe(1);
    expect(session?.cache.segmentMissCount).toBe(1);
  });

  it("expires stale shared sessions after inactivity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1800000\nvariant/high.m3u8\n"),
        headers: {
          get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
        },
      }),
    );

    await getChannelSharedMasterResponse("11111111-1111-1111-1111-111111111111");
    expect(listSharedStreamSessionSnapshots()).toHaveLength(1);

    vi.advanceTimersByTime(env.SHARED_STREAM_IDLE_TTL_MS + 1);
    cleanupStaleSharedStreamSessions(new Date(Date.now()));

    expect(listSharedStreamSessionSnapshots()).toHaveLength(0);
  });

  it("keeps the shared session active and visible when the upstream fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("socket hang up")));

    await expect(getChannelSharedMasterResponse("11111111-1111-1111-1111-111111111111")).rejects.toThrow(
      "socket hang up",
    );

    const status = await getChannelSharedStreamStatus("11111111-1111-1111-1111-111111111111");
    expect(status).toMatchObject({
      active: true,
      upstreamState: "ERROR",
      lastError: "socket hang up",
    });
  });
});
