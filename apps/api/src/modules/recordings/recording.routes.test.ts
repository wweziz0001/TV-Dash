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
    createdByUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "TV Dash Live · Scheduled recording",
    mode: "SCHEDULED",
    status: "SCHEDULED",
    startAt: new Date("2026-04-04T12:00:00.000Z"),
    endAt: new Date("2026-04-04T13:00:00.000Z"),
    actualStartAt: null,
    actualEndAt: null,
    failureReason: null,
    cancellationReason: null,
    createdAt: new Date("2026-04-03T10:00:00.000Z"),
    updatedAt: new Date("2026-04-03T10:00:00.000Z"),
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
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockPrisma.recordingJob.create).toHaveBeenCalled();
    expect(mockPokeRecordingRuntime).toHaveBeenCalled();
    expect(mockPrisma.auditEvent.create).toHaveBeenCalled();
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
