import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStructuredLogBuffer, writeStructuredLog } from "../../app/structured-log.js";

const mockListChannelCatalog = vi.fn();
const mockCleanupStalePlaybackSessions = vi.fn();
const mockListActivePlaybackSessions = vi.fn();

vi.mock("../channels/channel.service.js", () => ({
  listChannelCatalog: mockListChannelCatalog,
}));

vi.mock("./playback-session.service.js", () => ({
  ACTIVE_PLAYBACK_SESSION_TTL_MS: 45_000,
  cleanupStalePlaybackSessions: mockCleanupStalePlaybackSessions,
}));

vi.mock("./playback-session.repository.js", () => ({
  listActivePlaybackSessions: mockListActivePlaybackSessions,
}));

const { buildAdminMonitoringSnapshot } = await import("./monitoring.service.js");

describe("monitoring.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStructuredLogBuffer();
  });

  it("aggregates active sessions into per-channel viewer counts and recent failures", async () => {
    mockCleanupStalePlaybackSessions.mockResolvedValue({ count: 0 });
    mockListChannelCatalog.mockResolvedValue([
      {
        id: "channel-1",
        name: "World Feed",
        slug: "world-feed",
        playbackMode: "PROXY",
        sourceMode: "MASTER_PLAYLIST",
        isActive: true,
      },
      {
        id: "channel-2",
        name: "Arena",
        slug: "arena",
        playbackMode: "DIRECT",
        sourceMode: "MANUAL_VARIANTS",
        isActive: true,
      },
    ]);
    mockListActivePlaybackSessions.mockResolvedValue([
      {
        id: "session-1",
        userId: "user-1",
        channelId: "channel-1",
        sessionType: "SINGLE_VIEW",
        playbackState: "playing",
        selectedQuality: "AUTO",
        isMuted: false,
        tileIndex: null,
        failureKind: null,
        startedAt: new Date("2026-04-03T12:00:00.000Z"),
        lastSeenAt: new Date("2026-04-03T12:00:10.000Z"),
        endedAt: null,
        user: {
          id: "user-1",
          username: "alice",
          role: "USER",
        },
        channel: {
          id: "channel-1",
          name: "World Feed",
          slug: "world-feed",
          playbackMode: "PROXY",
          sourceMode: "MASTER_PLAYLIST",
          isActive: true,
        },
      },
      {
        id: "session-2",
        userId: "user-2",
        channelId: "channel-1",
        sessionType: "MULTIVIEW",
        playbackState: "retrying",
        selectedQuality: "LOWEST",
        isMuted: true,
        tileIndex: 1,
        failureKind: "network",
        startedAt: new Date("2026-04-03T12:00:01.000Z"),
        lastSeenAt: new Date("2026-04-03T12:00:11.000Z"),
        endedAt: null,
        user: {
          id: "user-2",
          username: "bob",
          role: "ADMIN",
        },
        channel: {
          id: "channel-1",
          name: "World Feed",
          slug: "world-feed",
          playbackMode: "PROXY",
          sourceMode: "MASTER_PLAYLIST",
          isActive: true,
        },
      },
    ]);

    writeStructuredLog("warn", {
      event: "playback.session.failed",
      actorUserId: "user-2",
      channelId: "channel-1",
      failureKind: "network",
    });

    const snapshot = await buildAdminMonitoringSnapshot();

    expect(snapshot.summary.activeSessionCount).toBe(2);
    expect(snapshot.summary.activeChannelCount).toBe(1);
    expect(snapshot.channelViewerCounts[0]).toMatchObject({
      channel: {
        id: "channel-1",
      },
      viewerCount: 2,
      singleViewCount: 1,
      multiviewCount: 1,
    });
    expect(snapshot.channelViewerCounts[0]?.watchers[0]?.username).toBe("bob");
    expect(snapshot.recentFailures[0]?.event).toBe("playback.session.failed");
  });
});
