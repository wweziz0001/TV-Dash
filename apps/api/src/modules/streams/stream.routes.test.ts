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
    clearTimeshiftBufferStateForTests();
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
        availableWindowSeconds: 18,
        bufferedSegmentCount: 3,
      }),
    });
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
