import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";

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
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
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
  recordingJob: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  recordingRule: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  recordingRun: {
    updateMany: vi.fn(),
  },
  auditEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

const { mockPokeRecordingRuntime, mockStopActiveRecordingJob } = vi.hoisted(() => ({
  mockPokeRecordingRuntime: vi.fn(),
  mockStopActiveRecordingJob: vi.fn(),
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: mockPrisma,
}));

vi.mock("./recording-runtime.js", () => ({
  pokeRecordingRuntime: mockPokeRecordingRuntime,
  stopActiveRecordingJob: mockStopActiveRecordingJob,
}));

const { buildServer } = await import("../../app/build-server.js");
const { createAuthHeaders } = await import("../../app/test-support.js");
const { createRecordingPlaybackToken } = await import("./recording-playback-token.js");

function buildChannelRecord() {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    name: "TV Dash Live",
    slug: "tv-dash-live",
    logoUrl: null,
    sourceMode: "MASTER_PLAYLIST",
    masterHlsUrl: "https://example.com/live.m3u8",
    playbackMode: "DIRECT",
    manualVariantCount: 0,
    groupId: null,
    group: null,
    epgSourceId: null,
    epgChannelId: null,
    epgSource: null,
    epgMapping: null,
    qualityVariants: [],
    manualPrograms: [],
    isActive: true,
    sortOrder: 1,
    createdAt: new Date("2026-04-03T10:00:00.000Z"),
    updatedAt: new Date("2026-04-03T10:00:00.000Z"),
  };
}

function buildRecordingJobRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    channelId: "22222222-2222-2222-2222-222222222222",
    channelNameSnapshot: "TV Dash Live",
    channelSlugSnapshot: "tv-dash-live",
    programEntryId: null,
    programTitleSnapshot: null,
    programDescriptionSnapshot: null,
    programCategorySnapshot: null,
    programStartAt: null,
    programEndAt: null,
    recordingRuleId: null,
    recordingRuleNameSnapshot: null,
    createdByUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "TV Dash Live · Scheduled recording",
    mode: "SCHEDULED",
    status: "SCHEDULED",
    paddingBeforeMinutes: 0,
    paddingAfterMinutes: 0,
    isProtected: false,
    protectedAt: null,
    startAt: new Date("2026-04-04T12:00:00.000Z"),
    endAt: new Date("2026-04-04T13:00:00.000Z"),
    actualStartAt: null,
    actualEndAt: null,
    failureReason: null,
    cancellationReason: null,
    createdAt: new Date("2026-04-03T10:00:00.000Z"),
    updatedAt: new Date("2026-04-03T10:00:00.000Z"),
    programEntry: null,
    recordingRule: null,
    channel: {
      id: "22222222-2222-2222-2222-222222222222",
      name: "TV Dash Live",
      slug: "tv-dash-live",
      isActive: true,
    },
    asset: null,
    runs: [],
    createdByUser: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      username: "admin",
      role: "ADMIN",
    },
    ...overrides,
  };
}

function buildRecordingRuleRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    channelId: "22222222-2222-2222-2222-222222222222",
    createdByUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    titleTemplate: "Morning News",
    recurrenceType: "WEEKLY",
    weekdays: ["MONDAY"],
    startsAt: new Date("2026-04-06T08:00:00.000Z"),
    durationMinutes: 60,
    timeZone: "UTC",
    paddingBeforeMinutes: 2,
    paddingAfterMinutes: 5,
    requestedQualitySelector: "AUTO",
    requestedQualityLabel: "Source default",
    originProgramEntryId: null,
    originProgramTitleSnapshot: null,
    originProgramStartAt: null,
    originProgramEndAt: null,
    matchProgramTitle: "Morning News",
    isActive: true,
    createdAt: new Date("2026-04-03T10:00:00.000Z"),
    updatedAt: new Date("2026-04-03T10:00:00.000Z"),
    channel: {
      id: "22222222-2222-2222-2222-222222222222",
      name: "TV Dash Live",
      slug: "tv-dash-live",
      isActive: true,
    },
    createdByUser: {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      username: "admin",
      role: "ADMIN",
    },
    originProgramEntry: null,
    ...overrides,
  };
}

describe("recordingRoutes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

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
    mockPrisma.channel.findUnique.mockResolvedValue(buildChannelRecord());
    mockPrisma.programEntry.findUnique.mockResolvedValue(null);
    mockPrisma.recordingJob.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.recordingJob.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.recordingRule.findMany.mockResolvedValue([]);
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("creates a recording job and pokes the runtime for follow-up work", async () => {
    mockPrisma.recordingJob.create.mockResolvedValue(
      buildRecordingJobRecord({
        mode: "IMMEDIATE",
        status: "PENDING",
        startAt: new Date("2026-04-03T11:00:00.000Z"),
        endAt: null,
      }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/recordings",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        channelId: "22222222-2222-2222-2222-222222222222",
        title: "",
        mode: "IMMEDIATE",
        startAt: null,
        endAt: null,
        programEntryId: null,
        paddingBeforeMinutes: 0,
        paddingAfterMinutes: 0,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.recordingJob.create).toHaveBeenCalled();
    expect(mockPokeRecordingRuntime).toHaveBeenCalled();
    expect(mockPrisma.auditEvent.create).toHaveBeenCalled();
  });

  it("creates an EPG-linked recording job from a guide programme", async () => {
    mockPrisma.programEntry.findUnique.mockResolvedValue({
      id: "44444444-4444-4444-4444-444444444444",
      sourceKind: "IMPORTED",
      channelId: null,
      title: "Morning News",
      subtitle: null,
      description: null,
      category: "News",
      imageUrl: null,
      startAt: new Date("2026-04-05T12:00:00.000Z"),
      endAt: new Date("2026-04-05T13:00:00.000Z"),
      channel: null,
      sourceChannel: {
        id: "source-channel-1",
        externalId: "news",
        source: {
          id: "source-1",
          name: "Guide Feed",
          slug: "guide-feed",
          sourceType: "XMLTV_URL",
          isActive: true,
        },
      },
    });
    mockPrisma.recordingJob.create.mockResolvedValue(
      buildRecordingJobRecord({
        mode: "EPG_PROGRAM",
        title: "Morning News",
        status: "SCHEDULED",
        programEntryId: "44444444-4444-4444-4444-444444444444",
        programTitleSnapshot: "Morning News",
        programStartAt: new Date("2026-04-05T12:00:00.000Z"),
        programEndAt: new Date("2026-04-05T13:00:00.000Z"),
        paddingBeforeMinutes: 2,
        paddingAfterMinutes: 5,
        startAt: new Date("2026-04-05T11:58:00.000Z"),
        endAt: new Date("2026-04-05T13:05:00.000Z"),
      }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/recordings",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        channelId: "22222222-2222-2222-2222-222222222222",
        title: "",
        mode: "EPG_PROGRAM",
        startAt: null,
        endAt: null,
        programEntryId: "44444444-4444-4444-4444-444444444444",
        paddingBeforeMinutes: 2,
        paddingAfterMinutes: 5,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.recordingJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mode: "EPG_PROGRAM",
          programEntryId: "44444444-4444-4444-4444-444444444444",
          programTitleSnapshot: "Morning News",
          paddingBeforeMinutes: 2,
          paddingAfterMinutes: 5,
        }),
      }),
    );
  });

  it("lists recording jobs using the requested status filter", async () => {
    mockPrisma.recordingJob.findMany.mockResolvedValue([
      buildRecordingJobRecord({
        status: "RECORDING",
      }),
    ]);

    const response = await server.inject({
      method: "GET",
      url: "/api/recordings?status=RECORDING",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.recordingJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: ["RECORDING"],
          },
        }),
      }),
    );
    expect(response.json()).toMatchObject({
      jobs: [
        {
          status: "RECORDING",
        },
      ],
    });
  });

  it("passes richer library filters through to the recordings query", async () => {
    mockPrisma.recordingJob.findMany.mockResolvedValue([
      buildRecordingJobRecord({
        status: "COMPLETED",
        mode: "EPG_PROGRAM",
        isProtected: true,
      }),
    ]);

    const response = await server.inject({
      method: "GET",
      url:
        "/api/recordings?status=COMPLETED&mode=EPG_PROGRAM&isProtected=true&recordedAfter=2026-04-01T00:00:00.000Z&recordedBefore=2026-04-03T23:59:59.999Z&sort=TITLE_ASC",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.recordingJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: ["COMPLETED"],
          },
          mode: {
            in: ["EPG_PROGRAM"],
          },
          isProtected: true,
          startAt: {
            gte: new Date("2026-04-01T00:00:00.000Z"),
            lte: new Date("2026-04-03T23:59:59.999Z"),
          },
        }),
        orderBy: [{ title: "asc" }, { startAt: "desc" }],
      }),
    );
  });

  it("updates a recording protection flag through the retention route", async () => {
    mockPrisma.recordingJob.findUnique.mockResolvedValue(buildRecordingJobRecord());
    mockPrisma.recordingJob.update.mockResolvedValue(
      buildRecordingJobRecord({
        isProtected: true,
        protectedAt: new Date("2026-04-03T10:30:00.000Z"),
      }),
    );

    const response = await server.inject({
      method: "PUT",
      url: "/api/recordings/33333333-3333-3333-3333-333333333333/retention",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        isProtected: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.recordingJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isProtected: true,
        }),
      }),
    );
    expect(response.json()).toMatchObject({
      job: {
        isProtected: true,
      },
    });
  });

  it("creates a recurring recording rule and generates upcoming jobs", async () => {
    mockPrisma.recordingRule.create.mockResolvedValue(
      buildRecordingRuleRecord({
        matchProgramTitle: null,
      }),
    );
    mockPrisma.recordingRule.findMany.mockResolvedValue([
      buildRecordingRuleRecord({
        matchProgramTitle: null,
      }),
    ]);
    mockPrisma.recordingJob.findMany.mockResolvedValue([]);

    const response = await server.inject({
      method: "POST",
      url: "/api/recording-rules",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
      payload: {
        channelId: "22222222-2222-2222-2222-222222222222",
        titleTemplate: "Morning News",
        recurrenceType: "WEEKLY",
        weekdays: ["MONDAY"],
        startsAt: "2026-04-06T08:00:00.000Z",
        durationMinutes: 60,
        timeZone: "UTC",
        originProgramEntryId: null,
        matchProgramTitle: null,
        paddingBeforeMinutes: 2,
        paddingAfterMinutes: 5,
        requestedQualitySelector: "AUTO",
        requestedQualityLabel: "Source default",
        isActive: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.recordingRule.create).toHaveBeenCalled();
    expect(mockPrisma.recordingJob.createMany).toHaveBeenCalled();
  });

  it("cancels a scheduled recording before it starts", async () => {
    mockPrisma.recordingJob.findUnique.mockResolvedValue(buildRecordingJobRecord());
    mockPrisma.recordingJob.update.mockResolvedValue(
      buildRecordingJobRecord({
        status: "CANCELED",
        cancellationReason: "Canceled before recording started",
      }),
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/recordings/33333333-3333-3333-3333-333333333333/cancel",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      job: {
        status: "CANCELED",
      },
    });
  });

  it("returns playback access for a completed recording asset", async () => {
    mockPrisma.recordingJob.findUnique.mockResolvedValue({
      id: "33333333-3333-3333-3333-333333333333",
      createdByUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      asset: {
        id: "asset-1",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/recordings/33333333-3333-3333-3333-333333333333/playback-access",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().playbackUrl).toContain("/api/recordings/33333333-3333-3333-3333-333333333333/media?token=");
  });

  it("streams recording media with range support when the playback token is valid", async () => {
    const relativeStoragePath = "tests/recording-media.mp4";
    const absoluteStoragePath = path.resolve(env.RECORDINGS_STORAGE_DIR, relativeStoragePath);
    await fs.mkdir(path.dirname(absoluteStoragePath), { recursive: true });
    await fs.writeFile(absoluteStoragePath, Buffer.from("0123456789"));

    mockPrisma.recordingJob.findUnique.mockResolvedValue({
      id: "33333333-3333-3333-3333-333333333333",
      createdByUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      asset: {
        id: "asset-1",
        recordingJobId: "33333333-3333-3333-3333-333333333333",
        recordingRunId: "run-1",
        channelId: "22222222-2222-2222-2222-222222222222",
        channelNameSnapshot: "TV Dash Live",
        channelSlugSnapshot: "tv-dash-live",
        title: "TV Dash Live · Recording",
        storagePath: relativeStoragePath,
        fileName: "recording-media.mp4",
        mimeType: "video/mp4",
        containerFormat: "mp4",
        startedAt: new Date("2026-04-03T10:00:00.000Z"),
        endedAt: new Date("2026-04-03T10:30:00.000Z"),
        durationSeconds: 1800,
        fileSizeBytes: BigInt(10),
        createdAt: new Date("2026-04-03T10:30:00.000Z"),
        updatedAt: new Date("2026-04-03T10:30:00.000Z"),
      },
    });

    const token = createRecordingPlaybackToken({
      recordingJobId: "33333333-3333-3333-3333-333333333333",
      recordingAssetId: "asset-1",
    });

    const response = await server.inject({
      method: "GET",
      url: `/api/recordings/33333333-3333-3333-3333-333333333333/media?token=${encodeURIComponent(token)}`,
      headers: {
        range: "bytes=0-4",
      },
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers["content-range"]).toBe("bytes 0-4/10");
    expect(response.body).toBe("01234");
  });
});
