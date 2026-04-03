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

describe("layoutRoutes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) =>
      Promise.resolve({
        id: where?.id ?? "11111111-1111-1111-1111-111111111111",
        email: "ops@example.com",
        username: "ops-user",
        role: "USER",
        sessionVersion: 0,
        createdAt: new Date("2026-04-02T00:00:00.000Z"),
        updatedAt: new Date("2026-04-02T00:00:00.000Z"),
      }),
    );
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("creates saved layouts for the authenticated user", async () => {
    mockPrisma.savedLayout.create.mockResolvedValue({
      id: "88888888-8888-8888-8888-888888888888",
      userId: "11111111-1111-1111-1111-111111111111",
      name: "Ops Wall",
      layoutType: "LAYOUT_2X2",
      configJson: {
        activeAudioTile: 0,
      },
      items: [
        {
          id: "item-1",
          tileIndex: 0,
          channelId: "77777777-7777-7777-7777-777777777777",
          preferredQuality: "AUTO",
          isMuted: false,
          channel: null,
        },
      ],
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/layouts",
      headers: createAuthHeaders(server),
      payload: {
        name: "Ops Wall",
        layoutType: "LAYOUT_2X2",
        configJson: {
          activeAudioTile: 0,
        },
        items: [
          {
            tileIndex: 0,
            channelId: "77777777-7777-7777-7777-777777777777",
            preferredQuality: "AUTO",
            isMuted: false,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.savedLayout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "11111111-1111-1111-1111-111111111111",
        }),
      }),
    );
  });

  it("returns 404 when updating a layout the user does not own", async () => {
    mockPrisma.savedLayout.findFirst.mockResolvedValue(null);

    const response = await server.inject({
      method: "PUT",
      url: "/api/layouts/99999999-9999-9999-9999-999999999999",
      headers: createAuthHeaders(server),
      payload: {
        name: "Ops Wall",
        layoutType: "LAYOUT_2X2",
        configJson: {},
        items: [
          {
            tileIndex: 0,
            channelId: null,
            preferredQuality: "AUTO",
            isMuted: false,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Layout not found" });
  });

  it("rejects invalid layout payloads", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/layouts",
      headers: createAuthHeaders(server),
      payload: {
        name: "X",
        layoutType: "LAYOUT_2X2",
        configJson: {},
        items: [],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.savedLayout.create).not.toHaveBeenCalled();
  });
});
