import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
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

describe("authRoutes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("issues session-version-aware tokens on login", async () => {
    const passwordHash = await bcrypt.hash("Admin123!", 4);

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      email: "admin@example.com",
      username: "admin",
      passwordHash,
      role: "ADMIN",
      sessionVersion: 3,
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      updatedAt: new Date("2026-04-03T00:00:00.000Z"),
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@example.com",
        password: "Admin123!",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const claims = (server as typeof server & { jwt: { verify(token: string): unknown } }).jwt.verify(body.token) as {
      sessionVersion: number;
    };

    expect(claims.sessionVersion).toBe(3);
    expect(body.user).toMatchObject({
      username: "admin",
      role: "ADMIN",
    });
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "auth.login",
          actorUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        }),
      }),
    );
  });

  it("rejects auth/me for stale session versions", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      email: "ops@example.com",
      username: "ops-user",
      role: "USER",
      sessionVersion: 2,
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      updatedAt: new Date("2026-04-03T00:00:00.000Z"),
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: createAuthHeaders(server, { sessionVersion: 1 }),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Unauthorized" });
  });

  it("revokes the current user session version on logout", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      email: "admin@example.com",
      username: "admin",
      role: "ADMIN",
      sessionVersion: 0,
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      updatedAt: new Date("2026-04-03T00:00:00.000Z"),
    });
    mockPrisma.user.update.mockResolvedValue({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      email: "admin@example.com",
      username: "admin",
      role: "ADMIN",
      sessionVersion: 1,
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      updatedAt: new Date("2026-04-03T00:00:00.000Z"),
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: createAuthHeaders(server, { role: "ADMIN", sessionVersion: 0 }),
    });

    expect(response.statusCode).toBe(204);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        },
      }),
    );
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "auth.logout",
          actorUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        }),
      }),
    );
  });
});
