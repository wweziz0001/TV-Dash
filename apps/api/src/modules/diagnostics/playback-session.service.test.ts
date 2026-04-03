import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listStructuredLogs, resetStructuredLogBuffer } from "../../app/structured-log.js";

const mockExpireStalePlaybackSessions = vi.fn();
const mockFindPlaybackSessionsByIds = vi.fn();
const mockMarkPlaybackSessionsEnded = vi.fn();
const mockUpsertPlaybackSession = vi.fn();

vi.mock("./playback-session.repository.js", () => ({
  expireStalePlaybackSessions: mockExpireStalePlaybackSessions,
  findPlaybackSessionsByIds: mockFindPlaybackSessionsByIds,
  markPlaybackSessionsEnded: mockMarkPlaybackSessionsEnded,
  upsertPlaybackSession: mockUpsertPlaybackSession,
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
          channelId: "22222222-2222-2222-2222-222222222222",
          sessionType: "SINGLE_VIEW",
          playbackState: "playing",
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
        userId: "user-1",
        channelId: "22222222-2222-2222-2222-222222222222",
        sessionType: "SINGLE_VIEW",
        playbackState: "playing",
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
          channelId: "22222222-2222-2222-2222-222222222222",
          sessionType: "SINGLE_VIEW",
          playbackState: "error",
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
        userId: "user-1",
        channelId: "22222222-2222-2222-2222-222222222222",
        sessionType: "SINGLE_VIEW",
        playbackState: "error",
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
          channelId: "22222222-2222-2222-2222-222222222222",
          sessionType: "SINGLE_VIEW",
          playbackState: "playing",
          selectedQuality: "AUTO",
          isMuted: false,
          tileIndex: null,
          failureKind: null,
        },
      ],
    });

    expect(listStructuredLogs({ category: "playback" }).map((entry) => entry.event)).toEqual([
      "playback.session.recovered",
      "playback.session.failed",
      "playback.session.started",
    ]);
  });

  it("marks sessions ended and logs the lifecycle closeout", async () => {
    mockFindPlaybackSessionsByIds.mockResolvedValue([
      {
        id: "11111111-1111-1111-1111-111111111111",
        userId: "user-1",
        channelId: "channel-1",
        sessionType: "MULTIVIEW",
        playbackState: "buffering",
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
});
