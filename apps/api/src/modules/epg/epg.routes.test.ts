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
  auditEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock("../../db/prisma.js", () => ({
  prisma: mockPrisma,
}));

const { buildServer } = await import("../../app/build-server.js");
const { createAuthHeaders, createPrismaError } = await import("../../app/test-support.js");

const xmltv = `
  <tv>
    <channel id="news-desk">
      <display-name>News Desk</display-name>
    </channel>
    <programme channel="news-desk" start="20260402090000 +0000" stop="20260402100000 +0000">
      <title>Morning Brief</title>
    </programme>
    <programme channel="news-desk" start="20260402100000 +0000" stop="20260402110000 +0000">
      <title>Market Watch</title>
    </programme>
  </tv>
`;

describe("epgRoutes", () => {
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
    await server.close();
    vi.unstubAllGlobals();
  });

  it("creates an EPG source for admins", async () => {
    mockPrisma.epgSource.create.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Ops XMLTV",
      slug: "ops-xmltv",
      sourceType: "XMLTV",
      url: "https://example.com/guide.xml",
      isActive: true,
      refreshIntervalMinutes: 360,
      requestUserAgent: null,
      requestReferrer: null,
      requestHeaders: null,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
      _count: {
        channels: 0,
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/epg/sources",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        name: "Ops XMLTV",
        slug: "ops-xmltv",
        sourceType: "XMLTV",
        url: "https://example.com/guide.xml",
        isActive: true,
        refreshIntervalMinutes: 360,
        requestHeaders: {},
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.epgSource.create).toHaveBeenCalled();
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "epg-source.create",
          targetType: "epg-source",
          targetName: "ops-xmltv",
        }),
      }),
    );
  });

  it("rejects reserved upstream headers in EPG source configuration", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/epg/sources",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        name: "Ops XMLTV",
        slug: "ops-xmltv",
        sourceType: "XMLTV",
        url: "https://example.com/guide.xml",
        isActive: true,
        refreshIntervalMinutes: 360,
        requestHeaders: {
          authorization: "Basic secret",
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.epgSource.create).not.toHaveBeenCalled();
  });

  it("maps duplicate EPG source slugs to 409", async () => {
    mockPrisma.epgSource.create.mockRejectedValue(createPrismaError("P2002"));

    const response = await server.inject({
      method: "POST",
      url: "/api/epg/sources",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        name: "Ops XMLTV",
        slug: "ops-xmltv",
        sourceType: "XMLTV",
        url: "https://example.com/guide.xml",
        isActive: true,
        refreshIntervalMinutes: 360,
        requestHeaders: {},
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "EPG source slug already exists" });
  });

  it("previews XMLTV channels for a configured source", async () => {
    mockPrisma.epgSource.findUnique.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Ops XMLTV",
      slug: "ops-xmltv",
      sourceType: "XMLTV",
      url: "https://example.com/guide.xml",
      isActive: true,
      refreshIntervalMinutes: 360,
      requestUserAgent: null,
      requestReferrer: null,
      requestHeaders: null,
      createdAt: new Date("2026-04-02T00:00:00.000Z"),
      updatedAt: new Date("2026-04-02T00:00:00.000Z"),
      _count: {
        channels: 1,
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(xmltv),
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/epg/sources/11111111-1111-1111-1111-111111111111/channels",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      channels: [
        {
          id: "news-desk",
          displayNames: ["News Desk"],
        },
      ],
    });
  });

  it("returns now/next programme data for linked channels", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T09:30:00.000Z"));

    mockPrisma.channel.findMany.mockResolvedValue([
      {
        id: "22222222-2222-2222-2222-222222222222",
        name: "News Desk",
        epgChannelId: "news-desk",
        epgSource: {
          id: "11111111-1111-1111-1111-111111111111",
          name: "Ops XMLTV",
          slug: "ops-xmltv",
          sourceType: "XMLTV",
          url: "https://example.com/guide.xml",
          isActive: true,
          refreshIntervalMinutes: 360,
          requestUserAgent: null,
          requestReferrer: null,
          requestHeaders: null,
        },
      },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(xmltv),
      }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/epg/now-next?channelIds=22222222-2222-2222-2222-222222222222",
      headers: createAuthHeaders(server),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          channelId: "22222222-2222-2222-2222-222222222222",
          status: "READY",
          now: {
            title: "Morning Brief",
            subtitle: null,
            description: null,
            start: "2026-04-02T09:00:00.000Z",
            stop: "2026-04-02T10:00:00.000Z",
          },
          next: {
            title: "Market Watch",
            subtitle: null,
            description: null,
            start: "2026-04-02T10:00:00.000Z",
            stop: "2026-04-02T11:00:00.000Z",
          },
        },
      ],
    });

    vi.useRealTimers();
  });

  it("rejects invalid now/next query payloads before hitting services", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/epg/now-next?channelIds=not-a-uuid",
      headers: createAuthHeaders(server),
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.channel.findMany).not.toHaveBeenCalled();
  });
});
