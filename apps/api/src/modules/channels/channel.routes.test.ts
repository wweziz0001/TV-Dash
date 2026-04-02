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

  it("creates a channel for admins with proxy and upstream request configuration", async () => {
    mockPrisma.channel.create.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "News Desk",
      slug: "news-desk",
      logoUrl: null,
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
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.channel.create).toHaveBeenCalledWith({
      data: {
        name: "News Desk",
        slug: "news-desk",
        logoUrl: null,
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
      }),
    });
  });

  it("returns the admin channel config with upstream request fields", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "News Desk",
      slug: "news-desk",
      logoUrl: null,
      masterHlsUrl: "https://example.com/news.m3u8",
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
        playbackMode: "PROXY",
        upstreamUserAgent: "OpsBot/1.0",
        upstreamReferrer: "https://ops.example.com/",
        upstreamHeaders: { "x-token": "abc" },
        epgChannelId: "news-desk",
      },
    });
  });

  it("updates sort order with the dedicated route", async () => {
    mockPrisma.channel.update.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "News Desk",
      slug: "news-desk",
      logoUrl: null,
      masterHlsUrl: "https://example.com/news.m3u8",
      playbackMode: "DIRECT",
      groupId: null,
      group: null,
      epgSourceId: null,
      epgChannelId: null,
      epgSource: null,
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
        masterHlsUrl: "https://example.com/news.m3u8",
        groupId: null,
        isActive: true,
        sortOrder: 2,
        playbackMode: "DIRECT",
        upstreamHeaders: {},
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Channel not found" });
  });
});
