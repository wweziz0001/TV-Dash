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

  it("creates a channel for admins and normalizes optional fields", async () => {
    mockPrisma.channel.create.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "News Desk",
      slug: "news-desk",
      logoUrl: null,
      masterHlsUrl: "https://example.com/news.m3u8",
      groupId: null,
      group: null,
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
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.channel.create).toHaveBeenCalledWith({
      data: {
        name: "News Desk",
        slug: "news-desk",
        logoUrl: null,
        masterHlsUrl: "https://example.com/news.m3u8",
        groupId: null,
        isActive: true,
        sortOrder: 2,
      },
      include: { group: true },
    });
  });

  it("rejects invalid list filters at the route edge", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/channels?active=maybe",
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.channel.findMany).not.toHaveBeenCalled();
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
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Channel not found" });
  });

  it("deletes channels with validated ids", async () => {
    mockPrisma.channel.delete.mockResolvedValue({
      id: "44444444-4444-4444-4444-444444444444",
    });

    const response = await server.inject({
      method: "DELETE",
      url: "/api/channels/44444444-4444-4444-4444-444444444444",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(204);
    expect(mockPrisma.channel.delete).toHaveBeenCalledWith({
      where: { id: "44444444-4444-4444-4444-444444444444" },
    });
  });
});
