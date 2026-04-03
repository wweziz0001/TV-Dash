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

describe("groupRoutes", () => {
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
  });

  it("creates groups for admins", async () => {
    mockPrisma.channelGroup.create.mockResolvedValue({
      id: "55555555-5555-5555-5555-555555555555",
      name: "Operations",
      slug: "operations",
      sortOrder: 1,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/groups",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        name: "Operations",
        slug: "operations",
        sortOrder: 1,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.channelGroup.create).toHaveBeenCalledWith({
      data: {
        name: "Operations",
        slug: "operations",
        sortOrder: 1,
      },
    });
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "group.create",
          targetType: "group",
          targetName: "operations",
        }),
      }),
    );
  });

  it("returns 409 for duplicate group slugs", async () => {
    mockPrisma.channelGroup.create.mockRejectedValue(createPrismaError("P2002"));

    const response = await server.inject({
      method: "POST",
      url: "/api/groups",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        name: "Operations",
        slug: "operations",
        sortOrder: 1,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "Group slug already exists" });
  });

  it("validates ids before delete operations", async () => {
    const response = await server.inject({
      method: "DELETE",
      url: "/api/groups/not-a-uuid",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.channelGroup.delete).not.toHaveBeenCalled();
  });

  it("blocks group administration for non-admin users", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/groups",
      headers: createAuthHeaders(server, { role: "USER" }),
      payload: {
        name: "Operations",
        slug: "operations",
        sortOrder: 1,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(mockPrisma.channelGroup.create).not.toHaveBeenCalled();
  });
});
