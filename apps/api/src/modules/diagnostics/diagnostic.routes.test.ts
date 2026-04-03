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
      epgMapping: {
        sourceChannel: {
          id: "source-channel-1",
          externalId: "pulse-24",
          source: {
            id: "44444444-4444-4444-4444-444444444444",
            name: "Ops XMLTV",
            slug: "ops-xmltv",
            sourceType: "XMLTV_URL",
            isActive: true,
            url: "https://example.com/guide.xml",
            refreshIntervalMinutes: 360,
          },
        },
      },
      epgSourceId: "44444444-4444-4444-4444-444444444444",
      epgChannelId: "pulse-24",
      qualityVariants: [
        {
          id: "variant-1",
        },
      ],
      manualPrograms: [],
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
      sourceType: "XMLTV_URL",
      url: "https://example.com/guide.xml",
      uploadedFileName: null,
      isActive: true,
      refreshIntervalMinutes: 360,
      requestUserAgent: null,
      requestReferrer: null,
      requestHeaders: null,
      lastImportStartedAt: null,
      lastImportedAt: null,
      lastImportStatus: "NEVER_IMPORTED",
      lastImportMessage: null,
      lastImportChannelCount: null,
      lastImportProgramCount: null,
      sourceChannels: [],
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      updatedAt: new Date("2026-04-03T00:00:00.000Z"),
      _count: {
        importedPrograms: 0,
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

  it("returns monitoring snapshots for admins", async () => {
    mockPrisma.channel.findMany.mockResolvedValue([
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Pulse 24",
        slug: "pulse-24",
        logoUrl: null,
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: null,
        playbackMode: "PROXY",
        groupId: null,
        group: null,
        epgMapping: null,
        epgSourceId: null,
        epgChannelId: null,
        epgSource: null,
        isActive: true,
        sortOrder: 1,
        qualityVariants: [],
        manualPrograms: [],
        favorites: [],
        playbackSessions: [],
        layoutItems: [],
        createdAt: new Date("2026-04-03T00:00:00.000Z"),
        updatedAt: new Date("2026-04-03T00:00:00.000Z"),
      },
    ]);
    mockPrisma.playbackSession.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.playbackSession.findMany.mockResolvedValue([
      {
        id: "session-1",
        userId: "user-1",
        channelId: "11111111-1111-1111-1111-111111111111",
        sessionType: "SINGLE_VIEW",
        playbackState: "playing",
        selectedQuality: "AUTO",
        isMuted: false,
        tileIndex: null,
        failureKind: null,
        startedAt: new Date("2026-04-03T05:00:00.000Z"),
        lastSeenAt: new Date("2026-04-03T05:00:10.000Z"),
        endedAt: null,
        user: {
          id: "user-1",
          username: "ops-user",
          role: "USER",
        },
        channel: {
          id: "11111111-1111-1111-1111-111111111111",
          name: "Pulse 24",
          slug: "pulse-24",
          playbackMode: "PROXY",
          sourceMode: "MASTER_PLAYLIST",
          isActive: true,
        },
      },
    ]);

    const response = await server.inject({
      method: "GET",
      url: "/api/diagnostics/monitoring",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      monitoring: {
        summary: {
          activeSessionCount: 1,
          activeChannelCount: 1,
        },
        sessions: [
          {
            sessionId: "session-1",
            user: {
              username: "ops-user",
            },
          },
        ],
        channelViewerCounts: [
          {
            channel: {
              slug: "pulse-24",
            },
            viewerCount: 1,
          },
        ],
      },
    });
  });

  it("blocks monitoring snapshots for non-admin users", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/diagnostics/monitoring",
      headers: createAuthHeaders(server, { role: "USER" }),
    });

    expect(response.statusCode).toBe(403);
  });
});
