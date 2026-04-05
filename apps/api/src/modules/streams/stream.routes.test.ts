import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
  channel: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  channelGroup: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  epgSource: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  favorite: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  savedLayout: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock("../../db/prisma.js", () => ({
  prisma: mockPrisma,
}));

const { buildServer } = await import("../../app/build-server.js");
const { createAuthHeaders } = await import("../../app/test-support.js");
const { readProxyToken } = await import("./proxy-token.js");
const { clearTimeshiftBufferStateForTests } = await import("./timeshift-buffer.js");
const { clearSharedStreamSessionsForTests, listSharedStreamSessionSnapshots } = await import("./shared-stream-session.js");

describe("streamRoutes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) =>
      Promise.resolve(
        where?.id === "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
          ? {
              id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
              email: "admin@example.com",
              username: "admin",
              role: "ADMIN",
              sessionVersion: 0,
              createdAt: new Date("2026-04-02T00:00:00.000Z"),
              updatedAt: new Date("2026-04-02T00:00:00.000Z"),
            }
          : {
              id: "11111111-1111-1111-1111-111111111111",
              email: "ops@example.com",
              username: "ops-user",
              role: "USER",
              sessionVersion: 0,
              createdAt: new Date("2026-04-02T00:00:00.000Z"),
              updatedAt: new Date("2026-04-02T00:00:00.000Z"),
            },
      ),
    );
    server = await buildServer();
  });

  afterEach(async () => {
    await clearTimeshiftBufferStateForTests();
    clearSharedStreamSessionsForTests();
    await server.close();
    vi.unstubAllGlobals();
  });

  it("rejects invalid stream test payloads before hitting the upstream fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await server.inject({
      method: "POST",
      url: "/api/streams/test",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        url: "not-a-url",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks stream inspection for non-admin users", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/streams/test",
      headers: createAuthHeaders(server, { role: "USER" }),
      payload: {
        url: "https://example.com/live.m3u8",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects reserved upstream headers in stream inspection", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/streams/test",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        url: "https://example.com/live.m3u8",
        requestHeaders: {
          authorization: "Bearer secret",
        },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("passes configured request headers into stream inspection", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("#EXTM3U\n"),
      headers: {
        get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
      },
    });
    vi.stubGlobal("fetch", fetchSpy);

    const response = await server.inject({
      method: "POST",
      url: "/api/streams/test",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        url: "https://example.com/live.m3u8",
        requestUserAgent: "OpsBot/1.0",
        requestReferrer: "https://ops.example.com/",
        requestHeaders: {
          "x-token": "abc",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const [, requestInit] = fetchSpy.mock.calls[0] ?? [];
    const headers = new Headers((requestInit as RequestInit).headers);

    expect(headers.get("user-agent")).toBe("OpsBot/1.0");
    expect(headers.get("referer")).toBe("https://ops.example.com/");
    expect(headers.get("x-token")).toBe("abc");
  });

  it("rewrites proxied master playlists to signed asset URLs", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Pulse 24",
      slug: "pulse-24",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://origin.example.com/live/master.m3u8",
      playbackMode: "PROXY",
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue("#EXTM3U\nvariant/high.m3u8\n"),
        headers: {
          get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
        },
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/11111111-1111-1111-1111-111111111111/master",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("/api/streams/channels/11111111-1111-1111-1111-111111111111/asset?token=");
  });

  it("issues longer-lived asset tokens for recording-intent master requests", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T00:00:00.000Z"));

    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Pulse 24",
      slug: "pulse-24",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://origin.example.com/live/master.m3u8",
      playbackMode: "PROXY",
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue("#EXTM3U\nvariant/high.m3u8\n"),
        headers: {
          get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
        },
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/11111111-1111-1111-1111-111111111111/master?intent=recording",
    });

    expect(response.statusCode).toBe(200);
    const tokenMatch = response.body.match(/token=([^"\s]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();

    const payload = readProxyToken(decodeURIComponent(tokenMatch?.[1] ?? ""), "11111111-1111-1111-1111-111111111111");

    expect(payload).not.toBeNull();
    expect((payload?.exp ?? 0) - Date.now()).toBe(24 * 60 * 60 * 1000);

    vi.useRealTimers();
  });

  it("generates a synthetic master playlist for manual-variant channels", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "Al Alam",
      slug: "al-alam",
      isActive: true,
      sourceMode: "MANUAL_VARIANTS",
      masterHlsUrl: null,
      playbackMode: "DIRECT",
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [
        {
          id: "variant-1",
          channelId: "22222222-2222-2222-2222-222222222222",
          label: "low",
          sortOrder: 0,
          playlistUrl: "https://example.com/live/low/index.m3u8",
          width: null,
          height: null,
          bandwidth: null,
          codecs: null,
          isActive: true,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
        {
          id: "variant-2",
          channelId: "22222222-2222-2222-2222-222222222222",
          label: "1080p",
          sortOrder: 1,
          playlistUrl: "https://example.com/live/high/index.m3u8",
          width: null,
          height: null,
          bandwidth: null,
          codecs: "avc1.640028,mp4a.40.2",
          isActive: true,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ],
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/22222222-2222-2222-2222-222222222222/master",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/vnd.apple.mpegurl");
    expect(response.body).toContain('NAME="low"');
    expect(response.body).toContain("https://example.com/live/low/index.m3u8");
    expect(response.body).toContain('CODECS="avc1.640028,mp4a.40.2"');
    expect(response.body).toContain("RESOLUTION=1920x1080");
  });

  it("rewrites manual-variant playlists through the proxy when proxy playback is enabled", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "33333333-3333-3333-3333-333333333333",
      name: "Proxy Manual",
      slug: "proxy-manual",
      isActive: true,
      sourceMode: "MANUAL_VARIANTS",
      masterHlsUrl: null,
      playbackMode: "PROXY",
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [
        {
          id: "variant-1",
          channelId: "33333333-3333-3333-3333-333333333333",
          label: "medium",
          sortOrder: 0,
          playlistUrl: "https://example.com/live/medium/index.m3u8",
          width: null,
          height: 540,
          bandwidth: null,
          codecs: null,
          isActive: true,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ],
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/33333333-3333-3333-3333-333333333333/master",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("/api/streams/channels/33333333-3333-3333-3333-333333333333/asset?token=");
  });

  it("reports real timeshift capability status for retained proxy-backed buffers", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "44444444-4444-4444-4444-444444444444",
      name: "Buffered News",
      slug: "buffered-news",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://origin.example.com/live/index.m3u8",
      playbackMode: "PROXY",
      timeshiftEnabled: true,
      timeshiftWindowMinutes: 30,
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url === "https://origin.example.com/live/index.m3u8") {
          return Promise.resolve({
            ok: true,
            text: vi.fn().mockResolvedValue(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:10
#EXTINF:6.0,
segment10.ts
#EXTINF:6.0,
segment11.ts
#EXTINF:6.0,
segment12.ts`),
            headers: {
              get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
            },
          });
        }

        return Promise.resolve({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
          headers: {
            get: vi.fn().mockReturnValue("video/mp2t"),
          },
        });
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/44444444-4444-4444-4444-444444444444/timeshift/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: expect.objectContaining({
        configured: true,
        supported: true,
        available: false,
        bufferState: "WARMING",
        minimumReadyWindowSeconds: 30,
        availableWindowSeconds: 18,
        bufferedSegmentCount: 3,
        message: "Timeshift buffer is warming up. DVR ready in ~12s.",
      }),
    });
  });

  it("warms only the default timeshift variant instead of downloading every variant immediately", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "66666666-6666-6666-6666-666666666666",
      name: "Adaptive Buffered News",
      slug: "adaptive-buffered-news",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://origin.example.com/master.m3u8",
      playbackMode: "PROXY",
      timeshiftEnabled: true,
      timeshiftWindowMinutes: 30,
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "https://origin.example.com/master.m3u8") {
        return Promise.resolve({
          ok: true,
          text: vi.fn().mockResolvedValue(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720
variant-a.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1920x1080
variant-b.m3u8`),
          headers: {
            get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
          },
        });
      }

      if (url === "https://origin.example.com/variant-a.m3u8") {
        return Promise.resolve({
          ok: true,
          text: vi.fn().mockResolvedValue(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:10
#EXTINF:6.0,
segment10.ts
#EXTINF:6.0,
segment11.ts
#EXTINF:6.0,
segment12.ts`),
          headers: {
            get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
          },
        });
      }

      if (url === "https://origin.example.com/segment10.ts" || url === "https://origin.example.com/segment11.ts" || url === "https://origin.example.com/segment12.ts") {
        return Promise.resolve({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
          headers: {
            get: vi.fn().mockReturnValue("video/mp2t"),
          },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/66666666-6666-6666-6666-666666666666/timeshift/status",
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://origin.example.com/master.m3u8", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("https://origin.example.com/variant-a.m3u8", expect.any(Object));
    expect(fetchMock).not.toHaveBeenCalledWith("https://origin.example.com/variant-b.m3u8", expect.any(Object));
  });

  it("serves a timeshift master playlist for proxy-backed channels with DVR enabled", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "55555555-5555-5555-5555-555555555555",
      name: "Buffered News",
      slug: "buffered-news",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://origin.example.com/live/index.m3u8",
      playbackMode: "PROXY",
      timeshiftEnabled: true,
      timeshiftWindowMinutes: 30,
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url === "https://origin.example.com/live/index.m3u8") {
          return Promise.resolve({
            ok: true,
            text: vi.fn().mockResolvedValue(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:20
#EXTINF:6.0,
segment20.ts
#EXTINF:6.0,
segment21.ts
#EXTINF:6.0,
segment22.ts
#EXTINF:6.0,
segment23.ts
#EXTINF:6.0,
segment24.ts`),
            headers: {
              get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
            },
          });
        }

        return Promise.resolve({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
          headers: {
            get: vi.fn().mockReturnValue("video/mp2t"),
          },
        });
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/55555555-5555-5555-5555-555555555555/timeshift/master",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/vnd.apple.mpegurl");
    expect(response.body).toContain("/api/streams/channels/55555555-5555-5555-5555-555555555555/timeshift/variants/live/index.m3u8");
  });

  it("serves a retained-window archive master playlist for the requested programme range", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "56565656-5656-5656-5656-565656565656",
      name: "Catchup News",
      slug: "catchup-news",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://origin.example.com/live/master.m3u8",
      playbackMode: "PROXY",
      timeshiftEnabled: true,
      timeshiftWindowMinutes: 30,
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url === "https://origin.example.com/live/master.m3u8") {
          return Promise.resolve({
            ok: true,
            text: vi.fn().mockResolvedValue("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000\nvariant-a.m3u8\n"),
            headers: {
              get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
            },
          });
        }

        if (url === "https://origin.example.com/live/variant-a.m3u8") {
          return Promise.resolve({
            ok: true,
            text: vi.fn().mockResolvedValue(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:100
#EXT-X-PROGRAM-DATE-TIME:2026-04-05T09:00:00.000Z
#EXTINF:6.0,
segment100.ts
#EXT-X-PROGRAM-DATE-TIME:2026-04-05T09:00:06.000Z
#EXTINF:6.0,
segment101.ts
#EXT-X-PROGRAM-DATE-TIME:2026-04-05T09:00:12.000Z
#EXTINF:6.0,
segment102.ts
#EXT-X-PROGRAM-DATE-TIME:2026-04-05T09:00:18.000Z
#EXTINF:6.0,
segment103.ts
#EXT-X-PROGRAM-DATE-TIME:2026-04-05T09:00:24.000Z
#EXTINF:6.0,
segment104.ts`),
            headers: {
              get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
            },
          });
        }

        return Promise.resolve({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
          headers: {
            get: vi.fn().mockReturnValue("video/mp2t"),
          },
        });
      }),
    );

    const archiveMasterResponse = await server.inject({
      method: "GET",
      url: "/api/streams/channels/56565656-5656-5656-5656-565656565656/timeshift/archive/master?startAt=2026-04-05T09:00:06.000Z&endAt=2026-04-05T09:00:24.000Z",
    });

    expect(archiveMasterResponse.statusCode).toBe(200);
    expect(archiveMasterResponse.body).toContain("/timeshift/archive/variants/0/index.m3u8?startAt=");
  });

  it("starts a shared delivery session and rewrites the master playlist through shared asset paths", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "66666666-6666-6666-6666-666666666666",
      name: "Local News",
      slug: "local-news",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://origin.example.com/live/master.m3u8",
      playbackMode: "SHARED",
      timeshiftEnabled: false,
      timeshiftWindowMinutes: null,
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });

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

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/66666666-6666-6666-6666-666666666666/shared/master",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("/api/streams/channels/66666666-6666-6666-6666-666666666666/shared/assets/");
  });

  it("reports shared session status for shared-delivery channels", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "77777777-7777-7777-7777-777777777777",
      name: "Edge Feed",
      slug: "edge-feed",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://origin.example.com/live/master.m3u8",
      playbackMode: "SHARED",
      timeshiftEnabled: false,
      timeshiftWindowMinutes: null,
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/77777777-7777-7777-7777-777777777777/shared/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: expect.objectContaining({
        channelId: "77777777-7777-7777-7777-777777777777",
        configured: true,
        active: false,
        upstreamState: "IDLE",
      }),
    });
  });

  it("reports an integrated shared session with DVR status for shared channels", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "88888888-8888-8888-8888-888888888888",
      name: "Buffered Shared News",
      slug: "buffered-shared-news",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://origin.example.com/live/index.m3u8",
      playbackMode: "SHARED",
      timeshiftEnabled: true,
      timeshiftWindowMinutes: 30,
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url === "https://origin.example.com/live/index.m3u8") {
          return Promise.resolve({
            ok: true,
            text: vi.fn().mockResolvedValue(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:40
#EXTINF:6.0,
segment40.ts
#EXTINF:6.0,
segment41.ts
#EXTINF:6.0,
segment42.ts
#EXTINF:6.0,
segment43.ts
#EXTINF:6.0,
segment44.ts`),
            headers: {
              get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
            },
          });
        }

        return Promise.resolve({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
          headers: {
            get: vi.fn().mockReturnValue("video/mp2t"),
          },
        });
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/88888888-8888-8888-8888-888888888888/session/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: expect.objectContaining({
        channelId: "88888888-8888-8888-8888-888888888888",
        sessionMode: "SHARED_DVR",
        livePlaybackUrl: "/api/streams/channels/88888888-8888-8888-8888-888888888888/shared/master",
        bufferedPlaybackUrl: "/api/streams/channels/88888888-8888-8888-8888-888888888888/timeshift/master",
        defaultPlaybackUrl: "/api/streams/channels/88888888-8888-8888-8888-888888888888/timeshift/master",
        viewerModel: expect.objectContaining({
          liveEdgeAvailable: true,
          bufferedPlaybackSupported: true,
          bufferedPlaybackAvailable: true,
          defaultPlayback: "BUFFERED",
          playbackPositionScope: "PER_VIEWER",
          positionPersistence: "EPHEMERAL",
          reconnectBehavior: "RESET_TO_LIVE_EDGE",
          staleViewerStateTtlSeconds: 45,
        }),
        timeshift: expect.objectContaining({
          available: true,
          acquisitionMode: "SHARED_SESSION",
        }),
        sharedSession: expect.objectContaining({
          active: true,
        }),
      }),
    });
  });

  it("reuses the shared session cache when timeshift warms a shared channel buffer", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "99999999-9999-9999-9999-999999999999",
      name: "Integrated Feed",
      slug: "integrated-feed",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://origin.example.com/live/index.m3u8",
      playbackMode: "SHARED",
      timeshiftEnabled: true,
      timeshiftWindowMinutes: 30,
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "https://origin.example.com/live/index.m3u8") {
        return Promise.resolve({
          ok: true,
          text: vi.fn().mockResolvedValue(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:60
#EXTINF:6.0,
segment60.ts
#EXTINF:6.0,
segment61.ts
#EXTINF:6.0,
segment62.ts`),
          headers: {
            get: vi.fn().mockReturnValue("application/vnd.apple.mpegurl"),
          },
        });
      }

      return Promise.resolve({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
        headers: {
          get: vi.fn().mockReturnValue("video/mp2t"),
        },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const timeshiftResponse = await server.inject({
      method: "GET",
      url: "/api/streams/channels/99999999-9999-9999-9999-999999999999/timeshift/status",
    });
    expect(timeshiftResponse.statusCode).toBe(200);

    const sharedMasterResponse = await server.inject({
      method: "GET",
      url: "/api/streams/channels/99999999-9999-9999-9999-999999999999/shared/master",
    });
    expect(sharedMasterResponse.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(listSharedStreamSessionSnapshots()[0]).toMatchObject({
      channelId: "99999999-9999-9999-9999-999999999999",
      upstreamState: "ACTIVE",
    });
  });

  it("rejects invalid proxy asset tokens at the route edge", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/streams/channels/11111111-1111-1111-1111-111111111111/asset?token=invalid.invalid-token-with-length-1234567890",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Invalid or expired proxy token" });
  });

  it("maps upstream failures to 502 for metadata requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/streams/metadata?url=https://example.com/live.m3u8",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ message: "Upstream returned 503" });
  });
});
