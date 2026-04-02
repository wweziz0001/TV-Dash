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

describe("favoriteRoutes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("lists favorites for the authenticated user", async () => {
    mockPrisma.favorite.findMany.mockResolvedValue([
      {
        id: "66666666-6666-6666-6666-666666666666",
        userId: "11111111-1111-1111-1111-111111111111",
        channelId: "77777777-7777-7777-7777-777777777777",
        createdAt: "2026-04-02T00:00:00.000Z",
        channel: {
          id: "77777777-7777-7777-7777-777777777777",
          name: "Ops Feed",
          slug: "ops-feed",
          logoUrl: null,
          sourceMode: "MASTER_PLAYLIST",
          masterHlsUrl: "https://example.com/ops.m3u8",
          playbackMode: "DIRECT",
          upstreamUserAgent: null,
          upstreamReferrer: null,
          upstreamHeaders: null,
          groupId: null,
          group: null,
          epgSourceId: null,
          epgSource: null,
          epgChannelId: null,
          qualityVariants: [],
          isActive: true,
          sortOrder: 0,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      },
    ]);

    const response = await server.inject({
      method: "GET",
      url: "/api/favorites",
      headers: createAuthHeaders(server),
    });

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.favorite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "11111111-1111-1111-1111-111111111111" },
      }),
    );
  });

  it("adds a favorite through the validated payload", async () => {
    mockPrisma.favorite.upsert.mockResolvedValue({
      id: "66666666-6666-6666-6666-666666666666",
      userId: "11111111-1111-1111-1111-111111111111",
      channelId: "77777777-7777-7777-7777-777777777777",
      createdAt: "2026-04-02T00:00:00.000Z",
      channel: {
        id: "77777777-7777-7777-7777-777777777777",
        name: "Ops Feed",
        slug: "ops-feed",
        logoUrl: null,
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: "https://example.com/ops.m3u8",
        playbackMode: "DIRECT",
        upstreamUserAgent: null,
        upstreamReferrer: null,
        upstreamHeaders: null,
        groupId: null,
        group: null,
        epgSourceId: null,
        epgSource: null,
        epgChannelId: null,
        qualityVariants: [],
        isActive: true,
        sortOrder: 0,
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/favorites",
      headers: createAuthHeaders(server),
      payload: {
        channelId: "77777777-7777-7777-7777-777777777777",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.favorite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_channelId: {
            userId: "11111111-1111-1111-1111-111111111111",
            channelId: "77777777-7777-7777-7777-777777777777",
          },
        },
      }),
    );
  });

  it("rejects invalid favorite delete params", async () => {
    const response = await server.inject({
      method: "DELETE",
      url: "/api/favorites/not-a-uuid",
      headers: createAuthHeaders(server),
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.favorite.deleteMany).not.toHaveBeenCalled();
  });
});
