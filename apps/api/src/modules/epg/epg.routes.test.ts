import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  $transaction: vi.fn(),
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
  epgSourceChannel: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  epgChannelMapping: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  programEntry: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  recordingJob: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
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

function buildSourceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
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
    createdAt: new Date("2026-04-02T00:00:00.000Z"),
    updatedAt: new Date("2026-04-02T00:00:00.000Z"),
    _count: {
      importedPrograms: 0,
    },
    ...overrides,
  };
}

describe("epgRoutes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  const manualProgramId = "33333333-3333-3333-3333-333333333333";

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma));
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
    mockPrisma.recordingJob.findMany.mockResolvedValue([]);
    mockPrisma.recordingJob.findUnique.mockResolvedValue(null);
    mockPrisma.programEntry.findUnique.mockResolvedValue(null);
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
    vi.unstubAllGlobals();
  });

  it("creates an XMLTV URL source for admins", async () => {
    mockPrisma.epgSource.create.mockResolvedValue(buildSourceRecord());

    const response = await server.inject({
      method: "POST",
      url: "/api/epg/sources",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        name: "Ops XMLTV",
        slug: "ops-xmltv",
        sourceType: "XMLTV_URL",
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
        sourceType: "XMLTV_URL",
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
        sourceType: "XMLTV_URL",
        url: "https://example.com/guide.xml",
        isActive: true,
        refreshIntervalMinutes: 360,
        requestHeaders: {},
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "EPG source slug already exists" });
  });

  it("lists imported source channels for mapping", async () => {
    mockPrisma.epgSource.findUnique.mockResolvedValue(buildSourceRecord());
    mockPrisma.epgSourceChannel.findMany.mockResolvedValue([
      {
        id: "source-channel-1",
        sourceId: "11111111-1111-1111-1111-111111111111",
        externalId: "news-desk",
        displayName: "News Desk",
        displayNames: ["News Desk"],
        iconUrl: null,
        isAvailable: true,
        lastSeenAt: new Date("2026-04-02T09:00:00.000Z"),
        createdAt: new Date("2026-04-02T09:00:00.000Z"),
        updatedAt: new Date("2026-04-02T09:00:00.000Z"),
        source: {
          id: "11111111-1111-1111-1111-111111111111",
          name: "Ops XMLTV",
          slug: "ops-xmltv",
          sourceType: "XMLTV_URL",
          isActive: true,
        },
        mapping: null,
      },
    ]);

    const response = await server.inject({
      method: "GET",
      url: "/api/epg/sources/11111111-1111-1111-1111-111111111111/channels",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      channels: [
        {
          externalId: "news-desk",
          displayNames: ["News Desk"],
        },
      ],
    });
  });

  it("rejects overlapping manual programme entries", async () => {
    mockPrisma.programEntry.findMany.mockResolvedValue([
      {
        id: "manual-1",
        channelId: "22222222-2222-2222-2222-222222222222",
        startAt: new Date("2026-04-02T09:00:00.000Z"),
        endAt: new Date("2026-04-02T10:00:00.000Z"),
      },
    ]);

    const response = await server.inject({
      method: "POST",
      url: "/api/epg/programs/manual",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        channelId: "22222222-2222-2222-2222-222222222222",
        title: "Manual bulletin",
        subtitle: null,
        startAt: "2026-04-02T09:30:00.000Z",
        endAt: "2026-04-02T10:15:00.000Z",
        description: null,
        category: null,
        imageUrl: null,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: "Manual programme overlaps an existing manual entry on this channel",
    });
  });

  it("lists manual programme rows for a selected channel", async () => {
    mockPrisma.programEntry.findMany.mockResolvedValue([
      {
        id: "manual-1",
        sourceKind: "MANUAL",
        channelId: "22222222-2222-2222-2222-222222222222",
        title: "Manual bulletin",
        subtitle: null,
        description: "Lead-in",
        category: "News",
        imageUrl: null,
        startAt: new Date("2026-04-02T09:00:00.000Z"),
        endAt: new Date("2026-04-02T10:00:00.000Z"),
        createdAt: new Date("2026-04-02T08:55:00.000Z"),
        updatedAt: new Date("2026-04-02T08:55:00.000Z"),
        channel: {
          id: "22222222-2222-2222-2222-222222222222",
          name: "News Desk",
          slug: "news-desk",
          isActive: true,
        },
      },
    ]);

    const response = await server.inject({
      method: "GET",
      url: "/api/epg/programs/manual?channelId=22222222-2222-2222-2222-222222222222",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      programs: [
        {
          id: "manual-1",
          title: "Manual bulletin",
          channelId: "22222222-2222-2222-2222-222222222222",
        },
      ],
    });
    expect(mockPrisma.programEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceKind: "MANUAL",
          channelId: "22222222-2222-2222-2222-222222222222",
        }),
      }),
    );
  });

  it("rejects invalid manual time ranges before creating a programme", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/epg/programs/manual",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        channelId: "22222222-2222-2222-2222-222222222222",
        title: "Manual bulletin",
        subtitle: null,
        startAt: "2026-04-02T10:00:00.000Z",
        endAt: "2026-04-02T09:00:00.000Z",
        description: null,
        category: null,
        imageUrl: null,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.programEntry.create).not.toHaveBeenCalled();
  });

  it("updates a manual programme row", async () => {
    mockPrisma.programEntry.findMany.mockResolvedValue([]);
    mockPrisma.programEntry.update.mockResolvedValue({
      id: manualProgramId,
      sourceKind: "MANUAL",
      channelId: "22222222-2222-2222-2222-222222222222",
      title: "Updated bulletin",
      subtitle: null,
      description: null,
      category: "News",
      imageUrl: null,
      startAt: new Date("2026-04-02T10:00:00.000Z"),
      endAt: new Date("2026-04-02T11:00:00.000Z"),
      createdAt: new Date("2026-04-02T08:55:00.000Z"),
      updatedAt: new Date("2026-04-02T09:55:00.000Z"),
      channel: {
        id: "22222222-2222-2222-2222-222222222222",
        name: "News Desk",
        slug: "news-desk",
        isActive: true,
      },
    });

    const response = await server.inject({
      method: "PUT",
      url: `/api/epg/programs/manual/${manualProgramId}`,
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        channelId: "22222222-2222-2222-2222-222222222222",
        title: "Updated bulletin",
        subtitle: null,
        startAt: "2026-04-02T10:00:00.000Z",
        endAt: "2026-04-02T11:00:00.000Z",
        description: null,
        category: "News",
        imageUrl: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      program: {
        id: manualProgramId,
        title: "Updated bulletin",
      },
    });
    expect(mockPrisma.programEntry.update).toHaveBeenCalled();
  });

  it("deletes a manual programme row", async () => {
    mockPrisma.programEntry.findFirst.mockResolvedValue({
      id: manualProgramId,
      sourceKind: "MANUAL",
      channelId: "22222222-2222-2222-2222-222222222222",
      title: "Manual bulletin",
      subtitle: null,
      description: null,
      category: "News",
      imageUrl: null,
      startAt: new Date("2026-04-02T09:00:00.000Z"),
      endAt: new Date("2026-04-02T10:00:00.000Z"),
      createdAt: new Date("2026-04-02T08:55:00.000Z"),
      updatedAt: new Date("2026-04-02T08:55:00.000Z"),
      channel: {
        id: "22222222-2222-2222-2222-222222222222",
        name: "News Desk",
        slug: "news-desk",
        isActive: true,
      },
    });
    mockPrisma.programEntry.delete.mockResolvedValue({ id: manualProgramId });

    const response = await server.inject({
      method: "DELETE",
      url: `/api/epg/programs/manual/${manualProgramId}`,
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(204);
    expect(mockPrisma.programEntry.delete).toHaveBeenCalledWith({
      where: { id: manualProgramId },
    });
  });

  it("returns now/next programme data for mapped channels", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T09:30:00.000Z"));

    mockPrisma.channel.findMany.mockResolvedValue([
      {
        id: "22222222-2222-2222-2222-222222222222",
        name: "News Desk",
        epgMapping: {
          sourceChannel: {
            id: "source-channel-1",
            externalId: "news-desk",
            source: {
              id: "11111111-1111-1111-1111-111111111111",
              name: "Ops XMLTV",
              slug: "ops-xmltv",
              sourceType: "XMLTV_URL",
              url: "https://example.com/guide.xml",
              isActive: true,
              refreshIntervalMinutes: 360,
              requestUserAgent: null,
              requestReferrer: null,
              requestHeaders: null,
            },
          },
        },
      },
    ]);
    mockPrisma.programEntry.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "imported-1",
          sourceKind: "IMPORTED",
          sourceChannelId: "source-channel-1",
          title: "Morning Brief",
          subtitle: null,
          description: null,
          category: "News",
          imageUrl: null,
          startAt: new Date("2026-04-02T09:00:00.000Z"),
          endAt: new Date("2026-04-02T10:00:00.000Z"),
        },
        {
          id: "imported-2",
          sourceKind: "IMPORTED",
          sourceChannelId: "source-channel-1",
          title: "Market Watch",
          subtitle: null,
          description: null,
          category: "Business",
          imageUrl: null,
          startAt: new Date("2026-04-02T10:00:00.000Z"),
          endAt: new Date("2026-04-02T11:00:00.000Z"),
        },
      ]);

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
            id: "imported-1",
            sourceKind: "IMPORTED",
            title: "Morning Brief",
            subtitle: null,
            description: null,
            category: "News",
            imageUrl: null,
            start: "2026-04-02T09:00:00.000Z",
            stop: "2026-04-02T10:00:00.000Z",
            catchup: null,
          },
          next: {
            id: "imported-2",
            sourceKind: "IMPORTED",
            title: "Market Watch",
            subtitle: null,
            description: null,
            category: "Business",
            imageUrl: null,
            start: "2026-04-02T10:00:00.000Z",
            stop: "2026-04-02T11:00:00.000Z",
            catchup: null,
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

  it("surfaces previous-program catch-up availability from completed recordings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:00:00.000Z"));

    mockPrisma.channel.findMany.mockResolvedValue([
      {
        id: "22222222-2222-2222-2222-222222222222",
        name: "Ops News",
        epgMapping: null,
      },
    ]);
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "Ops News",
      slug: "ops-news",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://example.com/live/master.m3u8",
      playbackMode: "DIRECT",
      timeshiftEnabled: false,
      timeshiftWindowMinutes: null,
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });
    mockPrisma.programEntry.findMany
      .mockResolvedValueOnce([
        {
          id: "program-1",
          sourceKind: "MANUAL",
          channelId: "22222222-2222-2222-2222-222222222222",
          title: "Morning Brief",
          subtitle: null,
          description: "Top stories",
          category: "News",
          imageUrl: null,
          startAt: new Date("2026-04-05T08:00:00.000Z"),
          endAt: new Date("2026-04-05T09:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.recordingJob.findMany.mockResolvedValue([
      {
        id: "recording-1",
        createdByUserId: "11111111-1111-1111-1111-111111111111",
        programEntryId: "program-1",
        title: "Morning Brief Recording",
        asset: {
          startedAt: new Date("2026-04-05T07:59:00.000Z"),
          endedAt: new Date("2026-04-05T09:02:00.000Z"),
        },
      },
    ]);

    const response = await server.inject({
      method: "GET",
      url: "/api/epg/channels/22222222-2222-2222-2222-222222222222/guide?startAt=2026-04-05T07:00:00.000Z&endAt=2026-04-05T12:00:00.000Z",
      headers: createAuthHeaders(server),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      guide: {
        channelId: "22222222-2222-2222-2222-222222222222",
        programmes: [
          {
            id: "program-1",
            catchup: {
              playbackState: "PREVIOUS_RECORDING",
              isCatchupPlayable: true,
              preferredSourceType: "RECORDING",
            },
          },
        ],
      },
    });

    vi.useRealTimers();
  });

  it("resolves programme playback through the preferred recording source", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:00:00.000Z"));

    mockPrisma.channel.findUnique.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "Ops News",
      slug: "ops-news",
      isActive: true,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://example.com/live/master.m3u8",
      playbackMode: "DIRECT",
      timeshiftEnabled: false,
      timeshiftWindowMinutes: null,
      upstreamUserAgent: null,
      upstreamReferrer: null,
      upstreamHeaders: null,
      qualityVariants: [],
    });
    mockPrisma.programEntry.findUnique.mockResolvedValue({
      id: "44444444-4444-4444-4444-444444444444",
      sourceKind: "MANUAL",
      channelId: "22222222-2222-2222-2222-222222222222",
      title: "Morning Brief",
      subtitle: null,
      description: "Top stories",
      category: "News",
      imageUrl: null,
      startAt: new Date("2026-04-05T08:00:00.000Z"),
      endAt: new Date("2026-04-05T09:00:00.000Z"),
      channel: {
        id: "22222222-2222-2222-2222-222222222222",
        name: "Ops News",
        slug: "ops-news",
        isActive: true,
      },
      sourceChannel: null,
    });
    mockPrisma.recordingJob.findMany.mockResolvedValue([
      {
        id: "recording-1",
        createdByUserId: "11111111-1111-1111-1111-111111111111",
        programEntryId: "44444444-4444-4444-4444-444444444444",
        title: "Morning Brief Recording",
        asset: {
          startedAt: new Date("2026-04-05T07:58:00.000Z"),
          endedAt: new Date("2026-04-05T09:03:00.000Z"),
        },
      },
    ]);
    mockPrisma.recordingJob.findUnique.mockResolvedValue({
      id: "recording-1",
      createdByUserId: "11111111-1111-1111-1111-111111111111",
      asset: {
        id: "asset-1",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/epg/channels/22222222-2222-2222-2222-222222222222/programs/44444444-4444-4444-4444-444444444444/playback",
      headers: createAuthHeaders(server),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      playback: {
        programId: "44444444-4444-4444-4444-444444444444",
        sourceType: "RECORDING",
        playbackKind: "CATCHUP_RECORDING",
        playbackUrl: expect.stringContaining("/api/recordings/recording-1/media?token="),
      },
    });

    vi.useRealTimers();
  });
});
