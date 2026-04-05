import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listStructuredLogs, resetStructuredLogBuffer } from "../../app/structured-log.js";

const mockExpireStalePlaybackSessions = vi.fn();
const mockFindPlaybackSessionsByIds = vi.fn();
const mockMarkPlaybackSessionsEnded = vi.fn();
const mockUpsertPlaybackSession = vi.fn();
const mockCountActivePlaybackFailuresByChannel = vi.fn();
const mockGetChannelById = vi.fn();
const mockCreateOrUpdateActiveOperationalAlert = vi.fn();
const mockResolveOperationalAlertByDedupeKey = vi.fn();

vi.mock("./playback-session.repository.js", () => ({
  countActivePlaybackFailuresByChannel: mockCountActivePlaybackFailuresByChannel,
  expireStalePlaybackSessions: mockExpireStalePlaybackSessions,
  findPlaybackSessionsByIds: mockFindPlaybackSessionsByIds,
  markPlaybackSessionsEnded: mockMarkPlaybackSessionsEnded,
  upsertPlaybackSession: mockUpsertPlaybackSession,
}));

vi.mock("../channels/channel.service.js", () => ({
  getChannelById: mockGetChannelById,
}));

vi.mock("../alerts/alert.service.js", () => ({
  createOrUpdateActiveOperationalAlert: mockCreateOrUpdateActiveOperationalAlert,
  resolveOperationalAlertByDedupeKey: mockResolveOperationalAlertByDedupeKey,
}));

const {
  ACTIVE_PLAYBACK_SESSION_TTL_MS,
  cleanupStalePlaybackSessions,
  endPlaybackSessionsForUser,
  recordPlaybackSessionHeartbeat,
} = await import("./playback-session.service.js");

describe("playback-session.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountActivePlaybackFailuresByChannel.mockResolvedValue(0);
    mockGetChannelById.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "Ops Channel",
      slug: "ops-channel",
      playbackMode: "PROXY",
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: null,
      manualVariantCount: 0,
      groupId: null,
      group: null,
      epgSourceId: null,
      epgChannelId: null,
      epgSource: null,
      isActive: true,
      sortOrder: 1,
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z",
    });
  });

  afterEach(() => {
    resetStructuredLogBuffer();
  });

  it("expires stale sessions using the configured TTL", async () => {
    const now = new Date("2026-04-03T12:00:00.000Z");

    await cleanupStalePlaybackSessions(now);

    expect(mockExpireStalePlaybackSessions).toHaveBeenCalledTimes(1);
    expect(mockExpireStalePlaybackSessions).toHaveBeenCalledWith(
      new Date(now.getTime() - ACTIVE_PLAYBACK_SESSION_TTL_MS),
      now,
    );
  });

  it("logs session start, failure, and recovery transitions", async () => {
    mockFindPlaybackSessionsByIds.mockResolvedValueOnce([]);
    mockUpsertPlaybackSession.mockResolvedValue({});

    await recordPlaybackSessionHeartbeat("user-1", {
      sessions: [
        {
          sessionId: "11111111-1111-1111-1111-111111111111",
          surfaceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          channelId: "22222222-2222-2222-2222-222222222222",
          sessionType: "SINGLE_VIEW",
          playbackState: "playing",
          playbackPositionState: "LIVE_EDGE",
          liveOffsetSeconds: 0,
          selectedQuality: "AUTO",
          isMuted: false,
          tileIndex: null,
          failureKind: null,
        },
      ],
    });

    mockFindPlaybackSessionsByIds.mockResolvedValueOnce([
      {
        id: "11111111-1111-1111-1111-111111111111",
        surfaceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        userId: "user-1",
        channelId: "22222222-2222-2222-2222-222222222222",
        sessionType: "SINGLE_VIEW",
        playbackState: "playing",
        playbackPositionState: "LIVE_EDGE",
        liveOffsetSeconds: 0,
        selectedQuality: "AUTO",
        isMuted: false,
        tileIndex: null,
        failureKind: null,
        startedAt: new Date("2026-04-03T12:00:00.000Z"),
        lastSeenAt: new Date("2026-04-03T12:00:10.000Z"),
        endedAt: null,
      },
    ]);

    await recordPlaybackSessionHeartbeat("user-1", {
      sessions: [
        {
          sessionId: "11111111-1111-1111-1111-111111111111",
          surfaceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          channelId: "22222222-2222-2222-2222-222222222222",
          sessionType: "SINGLE_VIEW",
          playbackState: "error",
          playbackPositionState: "BEHIND_LIVE",
          liveOffsetSeconds: 42,
          selectedQuality: "AUTO",
          isMuted: false,
          tileIndex: null,
          failureKind: "network",
        },
      ],
    });

    mockFindPlaybackSessionsByIds.mockResolvedValueOnce([
      {
        id: "11111111-1111-1111-1111-111111111111",
        surfaceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        userId: "user-1",
        channelId: "22222222-2222-2222-2222-222222222222",
        sessionType: "SINGLE_VIEW",
        playbackState: "error",
        playbackPositionState: "BEHIND_LIVE",
        liveOffsetSeconds: 42,
        selectedQuality: "AUTO",
        isMuted: false,
        tileIndex: null,
        failureKind: "network",
        startedAt: new Date("2026-04-03T12:00:00.000Z"),
        lastSeenAt: new Date("2026-04-03T12:00:20.000Z"),
        endedAt: null,
      },
    ]);

    await recordPlaybackSessionHeartbeat("user-1", {
      sessions: [
        {
          sessionId: "11111111-1111-1111-1111-111111111111",
          surfaceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          channelId: "22222222-2222-2222-2222-222222222222",
          sessionType: "SINGLE_VIEW",
          playbackState: "playing",
          playbackPositionState: "LIVE_EDGE",
          liveOffsetSeconds: 0,
          selectedQuality: "AUTO",
          isMuted: false,
          tileIndex: null,
          failureKind: null,
        },
      ],
    });

    expect(listStructuredLogs({ category: "playback" }).map((entry) => entry.event)).toEqual([
      "playback.session.recovered",
      "playback.session.position.changed",
      "playback.session.failed",
      "playback.session.position.changed",
      "playback.session.started",
    ]);
  });

  it("marks sessions ended and logs the lifecycle closeout", async () => {
    mockFindPlaybackSessionsByIds.mockResolvedValue([
      {
        id: "11111111-1111-1111-1111-111111111111",
        surfaceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        userId: "user-1",
        channelId: "channel-1",
        sessionType: "MULTIVIEW",
        playbackState: "buffering",
        playbackPositionState: "PAUSED",
        liveOffsetSeconds: 18,
        selectedQuality: "LOWEST",
        isMuted: true,
        tileIndex: 2,
        failureKind: null,
        startedAt: new Date("2026-04-03T12:00:00.000Z"),
        lastSeenAt: new Date("2026-04-03T12:00:15.000Z"),
        endedAt: null,
      },
    ]);

    await endPlaybackSessionsForUser("user-1", {
      sessionIds: ["11111111-1111-1111-1111-111111111111"],
    });

    expect(mockMarkPlaybackSessionsEnded).toHaveBeenCalledTimes(1);
    expect(listStructuredLogs({ category: "playback" })[0]?.event).toBe("playback.session.ended");
  });

  it("raises and resolves a clustered playback alert when repeated failures clear", async () => {
    mockFindPlaybackSessionsByIds.mockResolvedValueOnce([
      {
        id: "11111111-1111-1111-1111-111111111111",
        surfaceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        userId: "user-1",
        channelId: "22222222-2222-2222-2222-222222222222",
        sessionType: "SINGLE_VIEW",
        playbackState: "playing",
        playbackPositionState: "LIVE_EDGE",
        liveOffsetSeconds: 0,
        selectedQuality: "AUTO",
        isMuted: false,
        tileIndex: null,
        failureKind: null,
        startedAt: new Date("2026-04-03T12:00:00.000Z"),
        lastSeenAt: new Date("2026-04-03T12:00:10.000Z"),
        endedAt: null,
      },
    ]);
    mockCountActivePlaybackFailuresByChannel.mockResolvedValueOnce(3);

    await recordPlaybackSessionHeartbeat("user-1", {
      sessions: [
        {
          sessionId: "11111111-1111-1111-1111-111111111111",
          surfaceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          channelId: "22222222-2222-2222-2222-222222222222",
          sessionType: "SINGLE_VIEW",
          playbackState: "error",
          playbackPositionState: "BEHIND_LIVE",
          liveOffsetSeconds: 27,
          selectedQuality: "AUTO",
          isMuted: false,
          tileIndex: null,
          failureKind: "network",
        },
      ],
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(mockCreateOrUpdateActiveOperationalAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PLAYBACK_FAILURE",
        category: "PLAYBACK",
        relatedEntityType: "PLAYBACK_CLUSTER",
      }),
    );

    mockFindPlaybackSessionsByIds.mockResolvedValueOnce([
      {
        id: "11111111-1111-1111-1111-111111111111",
        surfaceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        userId: "user-1",
        channelId: "22222222-2222-2222-2222-222222222222",
        sessionType: "SINGLE_VIEW",
        playbackState: "error",
        playbackPositionState: "BEHIND_LIVE",
        liveOffsetSeconds: 27,
        selectedQuality: "AUTO",
        isMuted: false,
        tileIndex: null,
        failureKind: "network",
        startedAt: new Date("2026-04-03T12:00:00.000Z"),
        lastSeenAt: new Date("2026-04-03T12:00:20.000Z"),
        endedAt: null,
      },
    ]);
    mockCountActivePlaybackFailuresByChannel.mockResolvedValueOnce(0);

    await recordPlaybackSessionHeartbeat("user-1", {
      sessions: [
        {
          sessionId: "11111111-1111-1111-1111-111111111111",
          surfaceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          channelId: "22222222-2222-2222-2222-222222222222",
          sessionType: "SINGLE_VIEW",
          playbackState: "playing",
          playbackPositionState: "LIVE_EDGE",
          liveOffsetSeconds: 0,
          selectedQuality: "AUTO",
          isMuted: false,
          tileIndex: null,
          failureKind: null,
        },
      ],
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(mockResolveOperationalAlertByDedupeKey).toHaveBeenCalledWith(
      expect.objectContaining({
        resolutionNotification: expect.objectContaining({
          type: "PLAYBACK_RECOVERED",
        }),
      }),
    );
  });
});
