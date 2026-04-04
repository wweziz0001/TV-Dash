import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStructuredLogBuffer, writeStructuredLog } from "../../app/structured-log.js";

const mockListChannelCatalog = vi.fn();
const mockCleanupStalePlaybackSessions = vi.fn();
const mockListActivePlaybackSessions = vi.fn();
const mockCleanupStaleSharedStreamSessions = vi.fn();
const mockListSharedStreamSessionSnapshots = vi.fn();
const mockCleanupStaleTimeshiftStates = vi.fn();
const mockListTimeshiftSessionSnapshots = vi.fn();

vi.mock("../channels/channel.service.js", () => ({
  listChannelCatalog: mockListChannelCatalog,
}));

vi.mock("../streams/shared-stream-session.js", () => ({
  cleanupStaleSharedStreamSessions: mockCleanupStaleSharedStreamSessions,
  listSharedStreamSessionSnapshots: mockListSharedStreamSessionSnapshots,
}));

vi.mock("../streams/timeshift-buffer.js", () => ({
  cleanupStaleTimeshiftStates: mockCleanupStaleTimeshiftStates,
  listTimeshiftSessionSnapshots: mockListTimeshiftSessionSnapshots,
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
    mockCleanupStaleSharedStreamSessions.mockReturnValue(undefined);
    mockCleanupStaleTimeshiftStates.mockResolvedValue(undefined);
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
        surfaceId: "surface-1",
        userId: "user-1",
        channelId: "channel-1",
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
        surfaceId: "surface-2",
        userId: "user-2",
        channelId: "channel-1",
        sessionType: "MULTIVIEW",
        playbackState: "retrying",
        playbackPositionState: "BEHIND_LIVE",
        liveOffsetSeconds: 27,
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
    mockListSharedStreamSessionSnapshots.mockReturnValue([
      {
        channelId: "channel-1",
        channelSlug: "world-feed",
        sourceMode: "MASTER_PLAYLIST",
        upstreamState: "ACTIVE",
        createdAt: "2026-04-03T11:59:55.000Z",
        lastAccessAt: "2026-04-03T12:00:11.000Z",
        expiresAt: "2026-04-03T12:03:11.000Z",
        lastUpstreamRequestAt: "2026-04-03T12:00:09.000Z",
        lastError: null,
        lastErrorAt: null,
        mappedAssetCount: 3,
        cache: {
          bytesUsed: 2048,
          entryCount: 3,
          manifestEntryCount: 1,
          segmentEntryCount: 2,
          manifestHitCount: 4,
          manifestMissCount: 1,
          segmentHitCount: 6,
          segmentMissCount: 2,
          inflightReuseCount: 2,
          upstreamRequestCount: 3,
          evictedEntryCount: 0,
        },
      },
    ]);
    mockListTimeshiftSessionSnapshots.mockResolvedValue([
      {
        channelId: "channel-1",
        channelSlug: "world-feed",
        playbackMode: "PROXY",
        sourceMode: "MASTER_PLAYLIST",
        acquisitionMode: "DIRECT_UPSTREAM",
        lastAccessAt: "2026-04-03T12:00:11.000Z",
        expiresAt: "2026-04-03T12:15:11.000Z",
        variantCount: 1,
        trackedVariantCount: 1,
        status: {
          channelId: "channel-1",
          configured: true,
          supported: true,
          available: true,
          acquisitionMode: "DIRECT_UPSTREAM",
          bufferState: "READY",
          message: "Live DVR window is ready.",
          windowSeconds: 1800,
          minimumReadyWindowSeconds: 30,
          availableWindowSeconds: 180,
          bufferedSegmentCount: 30,
          lastUpdatedAt: "2026-04-03T12:00:11.000Z",
          lastError: null,
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
    expect(snapshot.summary.activeSharedSessionCount).toBe(1);
    expect(snapshot.summary.activeSharedViewerCount).toBe(2);
    expect(snapshot.summary.sharedCacheHitRate).toBe(76.9);
    expect(snapshot.summary.activeTimeshiftSessionCount).toBe(1);
    expect(snapshot.summary.readyTimeshiftSessionCount).toBe(1);
    expect(snapshot.summary.liveEdgeViewerCount).toBe(1);
    expect(snapshot.summary.behindLiveViewerCount).toBe(1);
    expect(snapshot.summary.pausedViewerCount).toBe(0);
    expect(snapshot.channelViewerCounts[0]).toMatchObject({
      channel: {
        id: "channel-1",
      },
      sessionMode: "PROXY_DVR",
      viewerCount: 2,
      singleViewCount: 1,
      multiviewCount: 1,
      liveEdgeViewerCount: 1,
      behindLiveViewerCount: 1,
      pausedViewerCount: 0,
      sharedSession: {
        upstreamState: "ACTIVE",
        viewerCount: 2,
      },
      timeshiftSession: {
        available: true,
        acquisitionMode: "DIRECT_UPSTREAM",
        availableWindowSeconds: 180,
      },
    });
    expect(snapshot.channelViewerCounts[0]?.watchers[0]?.username).toBe("bob");
    expect(snapshot.channelViewerCounts[0]?.watchers[0]).toMatchObject({
      playbackPositionState: "BEHIND_LIVE",
      liveOffsetSeconds: 27,
    });
    expect(snapshot.recentFailures[0]?.event).toBe("playback.session.failed");
  });
});
