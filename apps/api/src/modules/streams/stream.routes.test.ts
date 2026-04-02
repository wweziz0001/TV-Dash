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

describe("streamRoutes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
    vi.unstubAllGlobals();
  });

  it("rejects invalid stream test payloads before hitting the upstream fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await server.inject({
      method: "POST",
      url: "/api/streams/test",
      headers: createAuthHeaders(server),
      payload: {
        url: "not-a-url",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
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
      headers: createAuthHeaders(server),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ message: "Upstream returned 503" });
  });
});
