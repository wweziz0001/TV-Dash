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
const { createAuthHeaders, createPrismaError } = await import("../../app/test-support.js");

describe("channelRoutes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("creates a master-playlist channel for admins with proxy and upstream request configuration", async () => {
    mockPrisma.channel.create.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "News Desk",
      slug: "news-desk",
      logoUrl: null,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://example.com/news.m3u8",
      playbackMode: "PROXY",
      upstreamUserAgent: "OpsBot/1.0",
      upstreamReferrer: "https://ops.example.com/",
      upstreamHeaders: { "x-token": "abc" },
      groupId: null,
      group: null,
      epgSourceId: null,
      epgChannelId: null,
      epgSource: null,
      qualityVariants: [],
      isActive: true,
      sortOrder: 2,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/channels",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        name: "News Desk",
        slug: "news-desk",
        logoUrl: "",
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: "https://example.com/news.m3u8",
        groupId: null,
        isActive: true,
        sortOrder: 2,
        playbackMode: "PROXY",
        upstreamUserAgent: "OpsBot/1.0",
        upstreamReferrer: "https://ops.example.com/",
        upstreamHeaders: {
          "x-token": "abc",
        },
        epgSourceId: null,
        epgChannelId: null,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.channel.create).toHaveBeenCalledWith({
      data: {
        name: "News Desk",
        slug: "news-desk",
        logoUrl: null,
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: "https://example.com/news.m3u8",
        playbackMode: "PROXY",
        upstreamUserAgent: "OpsBot/1.0",
        upstreamReferrer: "https://ops.example.com/",
        upstreamHeaders: { "x-token": "abc" },
        groupId: null,
        epgSourceId: null,
        epgChannelId: null,
        isActive: true,
        sortOrder: 2,
      },
      include: expect.objectContaining({
        group: true,
        epgSource: expect.any(Object),
        qualityVariants: expect.any(Object),
      }),
    });
  });

  it("creates a manual-variant channel with nested quality rows", async () => {
    mockPrisma.channel.create.mockResolvedValue({
      id: "44444444-4444-4444-4444-444444444444",
      name: "Al Alam",
      slug: "al-alam",
      logoUrl: null,
      sourceMode: "MANUAL_VARIANTS",
      masterHlsUrl: null,
      playbackMode: "DIRECT",
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      groupId: null,
      group: null,
      epgSourceId: null,
      epgChannelId: null,
      epgSource: null,
      qualityVariants: [
        {
          id: "variant-1",
          channelId: "44444444-4444-4444-4444-444444444444",
          label: "low",
          sortOrder: 0,
          playlistUrl: "https://example.com/live/low/index.m3u8",
          width: null,
          height: 360,
          bandwidth: null,
          codecs: null,
          isActive: true,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ],
      isActive: true,
      sortOrder: 4,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/channels",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        name: "Al Alam",
        slug: "al-alam",
        logoUrl: "",
        sourceMode: "MANUAL_VARIANTS",
        masterHlsUrl: null,
        manualVariants: [
          {
            label: "low",
            sortOrder: 0,
            playlistUrl: "https://example.com/live/low/index.m3u8",
            width: null,
            height: 360,
            bandwidth: null,
            codecs: null,
            isActive: true,
          },
        ],
        groupId: null,
        isActive: true,
        sortOrder: 4,
        playbackMode: "DIRECT",
        upstreamHeaders: {},
        epgSourceId: null,
        epgChannelId: null,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.channel.create).toHaveBeenCalledWith({
      data: {
        name: "Al Alam",
        slug: "al-alam",
        logoUrl: null,
        sourceMode: "MANUAL_VARIANTS",
        masterHlsUrl: null,
        playbackMode: "DIRECT",
        upstreamUserAgent: null,
        upstreamReferrer: null,
        upstreamHeaders: expect.anything(),
        groupId: null,
        epgSourceId: null,
        epgChannelId: null,
        isActive: true,
        sortOrder: 4,
        qualityVariants: {
          create: [
            {
              label: "low",
              sortOrder: 0,
              playlistUrl: "https://example.com/live/low/index.m3u8",
              width: null,
              height: 360,
              bandwidth: null,
              codecs: null,
              isActive: true,
            },
          ],
        },
      },
      include: expect.objectContaining({
        group: true,
        epgSource: expect.any(Object),
        qualityVariants: expect.any(Object),
      }),
    });
  });

  it("rejects mixed-mode payloads before hitting persistence", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/channels",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        name: "Broken Feed",
        slug: "broken-feed",
        logoUrl: "",
        sourceMode: "MANUAL_VARIANTS",
        masterHlsUrl: "https://example.com/live/master.m3u8",
        manualVariants: [
          {
            label: "high",
            sortOrder: 0,
            playlistUrl: "https://example.com/live/high/index.m3u8",
            width: null,
            height: 720,
            bandwidth: null,
            codecs: null,
            isActive: true,
          },
        ],
        groupId: null,
        isActive: true,
        sortOrder: 0,
        playbackMode: "DIRECT",
        upstreamHeaders: {},
        epgSourceId: null,
        epgChannelId: null,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.channel.create).not.toHaveBeenCalled();
  });

  it("returns the admin channel config with upstream request fields and manual variants", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "News Desk",
      slug: "news-desk",
      logoUrl: null,
      sourceMode: "MANUAL_VARIANTS",
      masterHlsUrl: null,
      playbackMode: "PROXY",
      upstreamUserAgent: "OpsBot/1.0",
      upstreamReferrer: "https://ops.example.com/",
      upstreamHeaders: { "x-token": "abc" },
      groupId: null,
      group: null,
      epgSourceId: "33333333-3333-3333-3333-333333333333",
      epgChannelId: "news-desk",
      epgSource: {
        id: "33333333-3333-3333-3333-333333333333",
        name: "Ops XMLTV",
        slug: "ops-xmltv",
        sourceType: "XMLTV",
        isActive: true,
        url: "https://example.com/guide.xml",
        refreshIntervalMinutes: 360,
      },
      qualityVariants: [
        {
          id: "variant-1",
          channelId: "22222222-2222-2222-2222-222222222222",
          label: "medium",
          sortOrder: 1,
          playlistUrl: "https://example.com/live/medium/index.m3u8",
          width: null,
          height: 540,
          bandwidth: 1600000,
          codecs: null,
          isActive: true,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ],
      isActive: true,
      sortOrder: 2,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/channels/22222222-2222-2222-2222-222222222222/config",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      channel: {
        sourceMode: "MANUAL_VARIANTS",
        manualVariantCount: 1,
        playbackMode: "PROXY",
        upstreamUserAgent: "OpsBot/1.0",
        upstreamReferrer: "https://ops.example.com/",
        upstreamHeaders: { "x-token": "abc" },
        epgChannelId: "news-desk",
        qualityVariants: [
          {
            label: "medium",
            height: 540,
          },
        ],
      },
    });
  });

  it("updates sort order with the dedicated route", async () => {
    mockPrisma.channel.update.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "News Desk",
      slug: "news-desk",
      logoUrl: null,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://example.com/news.m3u8",
      playbackMode: "DIRECT",
      groupId: null,
      group: null,
      epgSourceId: null,
      epgChannelId: null,
      epgSource: null,
      qualityVariants: [],
      isActive: true,
      sortOrder: 8,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    });

    const response = await server.inject({
      method: "PUT",
      url: "/api/channels/22222222-2222-2222-2222-222222222222/sort-order",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        sortOrder: 8,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.channel.update).toHaveBeenCalledWith({
      where: { id: "22222222-2222-2222-2222-222222222222" },
      data: {
        sortOrder: 8,
      },
      include: expect.objectContaining({
        group: true,
        epgSource: expect.any(Object),
        qualityVariants: expect.any(Object),
      }),
    });
  });

  it("maps missing channel updates to 404", async () => {
    mockPrisma.channel.update.mockRejectedValue(createPrismaError("P2025"));

    const response = await server.inject({
      method: "PUT",
      url: "/api/channels/33333333-3333-3333-3333-333333333333",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        name: "News Desk",
        slug: "news-desk",
        logoUrl: "https://example.com/logo.png",
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: "https://example.com/news.m3u8",
        groupId: null,
        isActive: true,
        sortOrder: 2,
        playbackMode: "DIRECT",
        upstreamHeaders: {},
        epgSourceId: null,
        epgChannelId: null,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Channel not found" });
  });
});
