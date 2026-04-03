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
  playbackSession: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
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
const { createAuthHeaders } = await import("../../app/test-support.js");

describe("auditRoutes", () => {
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
              createdAt: new Date("2026-04-03T00:00:00.000Z"),
              updatedAt: new Date("2026-04-03T00:00:00.000Z"),
            }
          : {
              id: "11111111-1111-1111-1111-111111111111",
              email: "ops@example.com",
              username: "ops-user",
              role: "USER",
              sessionVersion: 0,
              createdAt: new Date("2026-04-03T00:00:00.000Z"),
              updatedAt: new Date("2026-04-03T00:00:00.000Z"),
            },
      ),
    );
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("lists recent audit events for admins", async () => {
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      {
        id: "audit-1",
        action: "channel.create",
        targetType: "channel",
        targetId: "channel-1",
        targetName: "news-desk",
        actorUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        actorRole: "ADMIN",
        actorUser: {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          username: "admin",
          role: "ADMIN",
        },
        detailJson: {
          sourceMode: "MASTER_PLAYLIST",
        },
        createdAt: new Date("2026-04-03T06:00:00.000Z"),
      },
    ]);

    const response = await server.inject({
      method: "GET",
      url: "/api/audit/events?limit=10",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [
        {
          id: "audit-1",
          action: "channel.create",
          targetType: "channel",
          targetId: "channel-1",
          targetName: "news-desk",
          actorUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          actorRole: "ADMIN",
          actorUser: {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            username: "admin",
            role: "ADMIN",
          },
          detail: {
            sourceMode: "MASTER_PLAYLIST",
          },
          createdAt: "2026-04-03T06:00:00.000Z",
        },
      ],
    });
  });

  it("blocks audit trail access for non-admin users", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/audit/events",
      headers: createAuthHeaders(server, { role: "USER" }),
    });

    expect(response.statusCode).toBe(403);
  });
});
