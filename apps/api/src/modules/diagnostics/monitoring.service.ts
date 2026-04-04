import type {
  ChannelSourceMode,
  DiagnosticFailureKind,
  PlaybackPositionState,
  PlaybackSessionState,
  PlaybackSessionType,
  StreamPlaybackMode,
} from "@tv-dash/shared";
import {
  countStructuredLogsByLevel,
  listStructuredLogs,
  type StructuredLogCategory,
  type StructuredLogEntry,
} from "../../app/structured-log.js";
import { listChannelCatalog } from "../channels/channel.service.js";
import { cleanupStaleSharedStreamSessions, listSharedStreamSessionSnapshots } from "../streams/shared-stream-session.js";
import { cleanupStaleTimeshiftStates, listTimeshiftSessionSnapshots, type TimeshiftAcquisitionMode } from "../streams/timeshift-buffer.js";
import { ACTIVE_PLAYBACK_SESSION_TTL_MS, cleanupStalePlaybackSessions } from "./playback-session.service.js";
import { listActivePlaybackSessions, type ActivePlaybackSessionRecord } from "./playback-session.repository.js";

export interface AdminMonitoringSessionSnapshot {
  sessionId: string;
  surfaceId: string | null;
  sessionType: PlaybackSessionType;
  playbackState: PlaybackSessionState;
  playbackPositionState: PlaybackPositionState;
  liveOffsetSeconds: number;
  selectedQuality: string | null;
  isMuted: boolean;
  tileIndex: number | null;
  failureKind: DiagnosticFailureKind | null;
  startedAt: string;
  lastSeenAt: string;
  user: {
    id: string;
    username: string;
    role: "ADMIN" | "USER";
  };
  channel: {
    id: string;
    name: string;
    slug: string;
    playbackMode: StreamPlaybackMode;
    sourceMode: ChannelSourceMode;
    isActive: boolean;
  } | null;
}

export interface ChannelViewerCountSnapshot {
  channel: {
    id: string;
    name: string;
    slug: string;
    playbackMode: StreamPlaybackMode;
    sourceMode: ChannelSourceMode;
    isActive: boolean;
  };
  viewerCount: number;
  singleViewCount: number;
  multiviewCount: number;
  liveEdgeViewerCount: number;
  behindLiveViewerCount: number;
  pausedViewerCount: number;
  watchers: Array<{
    sessionId: string;
    userId: string;
    username: string;
    playbackState: PlaybackSessionState;
    playbackPositionState: PlaybackPositionState;
    liveOffsetSeconds: number;
    selectedQuality: string | null;
    isMuted: boolean;
    tileIndex: number | null;
    lastSeenAt: string;
  }>;
  sessionMode: "DIRECT" | "PROXY_RELAY" | "PROXY_DVR" | "SHARED_RELAY" | "SHARED_DVR";
  sharedSession: {
    upstreamState: "STARTING" | "ACTIVE" | "ERROR";
    viewerCount: number;
    createdAt: string;
    lastAccessAt: string;
    expiresAt: string;
    lastUpstreamRequestAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    mappedAssetCount: number;
    cache: {
      entryCount: number;
      manifestEntryCount: number;
      segmentEntryCount: number;
      bytesUsed: number;
      manifestHitCount: number;
      manifestMissCount: number;
      segmentHitCount: number;
      segmentMissCount: number;
      inflightReuseCount: number;
      upstreamRequestCount: number;
    };
  } | null;
  timeshiftSession: {
    configured: boolean;
    supported: boolean;
    available: boolean;
    acquisitionMode: TimeshiftAcquisitionMode;
    bufferState: "DISABLED" | "UNSUPPORTED" | "STARTING" | "WARMING" | "READY" | "ERROR";
    windowSeconds: number;
    availableWindowSeconds: number;
    bufferedSegmentCount: number;
    lastUpdatedAt: string | null;
    lastError: string | null;
  } | null;
}

export interface AdminMonitoringSnapshot {
  generatedAt: string;
  summary: {
    activeSessionCount: number;
    activeChannelCount: number;
    activeSharedSessionCount: number;
    activeSharedViewerCount: number;
    sharedCacheHitRate: number | null;
    activeTimeshiftSessionCount: number;
    readyTimeshiftSessionCount: number;
    liveEdgeViewerCount: number;
    behindLiveViewerCount: number;
    pausedViewerCount: number;
    warningLogCount: number;
    errorLogCount: number;
    staleAfterSeconds: number;
  };
  sessions: AdminMonitoringSessionSnapshot[];
  channelViewerCounts: ChannelViewerCountSnapshot[];
  recentFailures: StructuredLogEntry[];
}

export interface MonitoringLogFilters {
  level?: "info" | "warn" | "error";
  category?: StructuredLogCategory;
  actorUserId?: string;
  channelId?: string;
  sessionId?: string;
  search?: string;
  limit?: number;
}

type MonitoringChannel = Awaited<ReturnType<typeof listChannelCatalog>>[number];

function toSessionSnapshot(record: ActivePlaybackSessionRecord): AdminMonitoringSessionSnapshot {
  return {
    sessionId: record.id,
    surfaceId: record.surfaceId,
    sessionType: record.sessionType,
    playbackState: record.playbackState,
    playbackPositionState: record.playbackPositionState,
    liveOffsetSeconds: record.liveOffsetSeconds,
    selectedQuality: record.selectedQuality ?? null,
    isMuted: record.isMuted,
    tileIndex: record.tileIndex ?? null,
    failureKind: (record.failureKind as DiagnosticFailureKind | null) ?? null,
    startedAt: record.startedAt.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
    user: {
      id: record.user.id,
      username: record.user.username,
      role: record.user.role,
    },
    channel: record.channel
      ? {
          id: record.channel.id,
          name: record.channel.name,
          slug: record.channel.slug,
          playbackMode: record.channel.playbackMode,
          sourceMode: record.channel.sourceMode,
          isActive: record.channel.isActive,
        }
      : null,
  };
}

export async function buildAdminMonitoringSnapshot() {
  const now = new Date();
  await cleanupStalePlaybackSessions(now);
  cleanupStaleSharedStreamSessions(now);
  await cleanupStaleTimeshiftStates(now);

  const [channels, activeSessions, sharedSessions, timeshiftSessions] = await Promise.all([
    listChannelCatalog({}),
    listActivePlaybackSessions(new Date(now.getTime() - ACTIVE_PLAYBACK_SESSION_TTL_MS)),
    Promise.resolve(listSharedStreamSessionSnapshots()),
    listTimeshiftSessionSnapshots(),
  ]);
  const sessionSnapshots = activeSessions.map(toSessionSnapshot);
  const sessionsByChannelId = new Map<string, AdminMonitoringSessionSnapshot[]>();
  const sharedSessionsByChannelId = new Map(sharedSessions.map((session) => [session.channelId, session]));
  const timeshiftSessionsByChannelId = new Map(timeshiftSessions.map((session) => [session.channelId, session]));

  sessionSnapshots.forEach((session: AdminMonitoringSessionSnapshot) => {
    if (!session.channel) {
      return;
    }

    const current = sessionsByChannelId.get(session.channel.id) ?? [];
    current.push(session);
    sessionsByChannelId.set(session.channel.id, current);
  });

  const channelViewerCounts = channels.map((channel: MonitoringChannel) => {
    const watchers = [...(sessionsByChannelId.get(channel.id) ?? [])].sort(
      (left: AdminMonitoringSessionSnapshot, right: AdminMonitoringSessionSnapshot) =>
        new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime(),
    );

    return {
      channel: {
        id: channel.id,
        name: channel.name,
        slug: channel.slug,
        playbackMode: channel.playbackMode,
        sourceMode: channel.sourceMode,
        isActive: channel.isActive,
      },
      viewerCount: watchers.length,
      singleViewCount: watchers.filter((watcher) => watcher.sessionType === "SINGLE_VIEW").length,
      multiviewCount: watchers.filter((watcher) => watcher.sessionType === "MULTIVIEW").length,
      liveEdgeViewerCount: watchers.filter((watcher) => watcher.playbackPositionState === "LIVE_EDGE").length,
      behindLiveViewerCount: watchers.filter((watcher) => watcher.playbackPositionState === "BEHIND_LIVE").length,
      pausedViewerCount: watchers.filter((watcher) => watcher.playbackPositionState === "PAUSED").length,
      watchers: watchers.map((watcher) => ({
        sessionId: watcher.sessionId,
        userId: watcher.user.id,
        username: watcher.user.username,
        playbackState: watcher.playbackState,
        playbackPositionState: watcher.playbackPositionState,
        liveOffsetSeconds: watcher.liveOffsetSeconds,
        selectedQuality: watcher.selectedQuality,
        isMuted: watcher.isMuted,
        tileIndex: watcher.tileIndex,
        lastSeenAt: watcher.lastSeenAt,
      })),
      sessionMode: (() => {
        const timeshiftSession = timeshiftSessionsByChannelId.get(channel.id)?.status ?? null;

        if (channel.playbackMode === "DIRECT") {
          return "DIRECT";
        }

        if (channel.playbackMode === "SHARED") {
          return timeshiftSession?.configured ? "SHARED_DVR" : "SHARED_RELAY";
        }

        return timeshiftSession?.configured ? "PROXY_DVR" : "PROXY_RELAY";
      })(),
      sharedSession: (() => {
        const sharedSession = sharedSessionsByChannelId.get(channel.id);
        if (!sharedSession) {
          return null;
        }

        return {
          upstreamState: sharedSession.upstreamState,
          viewerCount: watchers.length,
          createdAt: sharedSession.createdAt,
          lastAccessAt: sharedSession.lastAccessAt,
          expiresAt: sharedSession.expiresAt,
          lastUpstreamRequestAt: sharedSession.lastUpstreamRequestAt,
          lastError: sharedSession.lastError,
          lastErrorAt: sharedSession.lastErrorAt,
          mappedAssetCount: sharedSession.mappedAssetCount,
          cache: {
            entryCount: sharedSession.cache.entryCount,
            manifestEntryCount: sharedSession.cache.manifestEntryCount,
            segmentEntryCount: sharedSession.cache.segmentEntryCount,
            bytesUsed: sharedSession.cache.bytesUsed,
            manifestHitCount: sharedSession.cache.manifestHitCount,
            manifestMissCount: sharedSession.cache.manifestMissCount,
            segmentHitCount: sharedSession.cache.segmentHitCount,
            segmentMissCount: sharedSession.cache.segmentMissCount,
            inflightReuseCount: sharedSession.cache.inflightReuseCount,
            upstreamRequestCount: sharedSession.cache.upstreamRequestCount,
          },
        };
      })(),
      timeshiftSession: (() => {
        const timeshiftSession = timeshiftSessionsByChannelId.get(channel.id)?.status ?? null;
        if (!timeshiftSession) {
          return null;
        }

        return {
          configured: timeshiftSession.configured,
          supported: timeshiftSession.supported,
          available: timeshiftSession.available,
          acquisitionMode: timeshiftSession.acquisitionMode,
          bufferState: timeshiftSession.bufferState,
          windowSeconds: timeshiftSession.windowSeconds,
          availableWindowSeconds: timeshiftSession.availableWindowSeconds,
          bufferedSegmentCount: timeshiftSession.bufferedSegmentCount,
          lastUpdatedAt: timeshiftSession.lastUpdatedAt,
          lastError: timeshiftSession.lastError,
        };
      })(),
    } satisfies ChannelViewerCountSnapshot;
  });

  channelViewerCounts.sort((left, right) => {
    if (right.viewerCount !== left.viewerCount) {
      return right.viewerCount - left.viewerCount;
    }

    return left.channel.name.localeCompare(right.channel.name);
  });

  const recentFailures = listStructuredLogs({ limit: 200 })
    .filter((entry) => entry.level === "warn" || entry.level === "error")
    .slice(0, 12);
  const sharedCacheHits = sharedSessions.reduce(
    (count, session) => count + session.cache.manifestHitCount + session.cache.segmentHitCount,
    0,
  );
  const sharedCacheMisses = sharedSessions.reduce(
    (count, session) => count + session.cache.manifestMissCount + session.cache.segmentMissCount,
    0,
  );
  const sharedCacheAccessCount = sharedCacheHits + sharedCacheMisses;
  const activeSharedViewerCount = channelViewerCounts.reduce(
    (count, entry) => count + (entry.sharedSession ? entry.viewerCount : 0),
    0,
  );
  const liveEdgeViewerCount = channelViewerCounts.reduce((count, entry) => count + entry.liveEdgeViewerCount, 0);
  const behindLiveViewerCount = channelViewerCounts.reduce((count, entry) => count + entry.behindLiveViewerCount, 0);
  const pausedViewerCount = channelViewerCounts.reduce((count, entry) => count + entry.pausedViewerCount, 0);

  return {
    generatedAt: now.toISOString(),
    summary: {
      activeSessionCount: sessionSnapshots.length,
      activeChannelCount: channelViewerCounts.filter((item: ChannelViewerCountSnapshot) => item.viewerCount > 0).length,
      activeSharedSessionCount: sharedSessions.length,
      activeSharedViewerCount,
      sharedCacheHitRate:
        sharedCacheAccessCount > 0 ? Number(((sharedCacheHits / sharedCacheAccessCount) * 100).toFixed(1)) : null,
      activeTimeshiftSessionCount: timeshiftSessions.length,
      readyTimeshiftSessionCount: timeshiftSessions.filter((session) => session.status.available).length,
      liveEdgeViewerCount,
      behindLiveViewerCount,
      pausedViewerCount,
      warningLogCount: countStructuredLogsByLevel("warn"),
      errorLogCount: countStructuredLogsByLevel("error"),
      staleAfterSeconds: ACTIVE_PLAYBACK_SESSION_TTL_MS / 1000,
    },
    sessions: sessionSnapshots,
    channelViewerCounts,
    recentFailures,
  } satisfies AdminMonitoringSnapshot;
}

export function listAdminMonitoringLogs(filters: MonitoringLogFilters = {}) {
  return listStructuredLogs(filters);
}
