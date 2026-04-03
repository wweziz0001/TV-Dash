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
const { createAuthHeaders } = await import("../../app/test-support.js");
const {
  recordChannelObservation,
  recordEpgObservation,
  recordEpgCacheState,
  resetRuntimeDiagnostics,
} = await import("./diagnostic.service.js");

describe("diagnosticRoutes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetRuntimeDiagnostics();
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
    resetRuntimeDiagnostics();
  });

  it("returns channel diagnostics snapshots for admins", async () => {
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Pulse 24",
      slug: "pulse-24",
      logoUrl: null,
      sourceMode: "MANUAL_VARIANTS",
      masterHlsUrl: null,
      playbackMode: "PROXY",
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      groupId: null,
      group: null,
      epgSourceId: "44444444-4444-4444-4444-444444444444",
      epgChannelId: "pulse-24",
      epgSource: {
        id: "44444444-4444-4444-4444-444444444444",
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
        },
      ],
      isActive: true,
      sortOrder: 1,
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      updatedAt: new Date("2026-04-03T00:00:00.000Z"),
    });

    recordChannelObservation("11111111-1111-1111-1111-111111111111", "syntheticMaster", {
      status: "failure",
      source: "SYNTHETIC_MASTER",
      reason: "Synthetic master playlist could not be generated because no active variants are available",
      failureKind: "synthetic-master",
      retryable: false,
      observedAt: new Date("2026-04-03T04:00:00.000Z"),
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/diagnostics/channels/11111111-1111-1111-1111-111111111111",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      diagnostics: {
        channelId: "11111111-1111-1111-1111-111111111111",
        healthState: "failing",
        current: {
          sourceMode: "MANUAL_VARIANTS",
          proxyEnabled: true,
          syntheticMasterExpected: true,
        },
        syntheticMaster: {
          lastFailureKind: "synthetic-master",
        },
      },
    });
  });

  it("returns epg diagnostics snapshots for admins", async () => {
    mockPrisma.epgSource.findUnique.mockResolvedValue({
      id: "44444444-4444-4444-4444-444444444444",
      name: "Ops XMLTV",
      slug: "ops-xmltv",
      sourceType: "XMLTV",
      url: "https://example.com/guide.xml",
      isActive: true,
      refreshIntervalMinutes: 360,
      requestUserAgent: null,
      requestReferrer: null,
      requestHeaders: null,
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      updatedAt: new Date("2026-04-03T00:00:00.000Z"),
      _count: {
        channels: 2,
      },
    });

    recordEpgObservation("44444444-4444-4444-4444-444444444444", "fetch", {
      status: "success",
      source: "XMLTV_LOAD",
      observedAt: new Date("2026-04-03T05:00:00.000Z"),
    });
    recordEpgObservation("44444444-4444-4444-4444-444444444444", "parse", {
      status: "success",
      source: "XMLTV_LOAD",
      observedAt: new Date("2026-04-03T05:00:01.000Z"),
      detail: {
        channelCount: 32,
        programmeCount: 1280,
      },
    });
    recordEpgCacheState({
      sourceId: "44444444-4444-4444-4444-444444444444",
      loadedAt: new Date("2026-04-03T05:00:01.000Z"),
      expiresAt: new Date("2026-04-03T11:00:01.000Z"),
      channelCount: 32,
      programmeCount: 1280,
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/diagnostics/epg-sources/44444444-4444-4444-4444-444444444444",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      diagnostics: {
        sourceId: "44444444-4444-4444-4444-444444444444",
        healthState: "healthy",
        cache: {
          channelCount: 32,
          programmeCount: 1280,
        },
      },
    });
  });
});
