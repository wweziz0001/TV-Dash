import type {
  ChannelSourceMode,
  DiagnosticFailureKind,
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
import { ACTIVE_PLAYBACK_SESSION_TTL_MS, cleanupStalePlaybackSessions } from "./playback-session.service.js";
import { listActivePlaybackSessions, type ActivePlaybackSessionRecord } from "./playback-session.repository.js";

export interface AdminMonitoringSessionSnapshot {
  sessionId: string;
  sessionType: PlaybackSessionType;
  playbackState: PlaybackSessionState;
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
  watchers: Array<{
    sessionId: string;
    userId: string;
    username: string;
    playbackState: PlaybackSessionState;
    selectedQuality: string | null;
    isMuted: boolean;
    tileIndex: number | null;
    lastSeenAt: string;
  }>;
}

export interface AdminMonitoringSnapshot {
  generatedAt: string;
  summary: {
    activeSessionCount: number;
    activeChannelCount: number;
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
    sessionType: record.sessionType,
    playbackState: record.playbackState,
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

  const [channels, activeSessions] = await Promise.all([
    listChannelCatalog({}),
    listActivePlaybackSessions(new Date(now.getTime() - ACTIVE_PLAYBACK_SESSION_TTL_MS)),
  ]);
  const sessionSnapshots = activeSessions.map(toSessionSnapshot);
  const sessionsByChannelId = new Map<string, AdminMonitoringSessionSnapshot[]>();

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
      watchers: watchers.map((watcher) => ({
        sessionId: watcher.sessionId,
        userId: watcher.user.id,
        username: watcher.user.username,
        playbackState: watcher.playbackState,
        selectedQuality: watcher.selectedQuality,
        isMuted: watcher.isMuted,
        tileIndex: watcher.tileIndex,
        lastSeenAt: watcher.lastSeenAt,
      })),
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

  return {
    generatedAt: now.toISOString(),
    summary: {
      activeSessionCount: sessionSnapshots.length,
      activeChannelCount: channelViewerCounts.filter((item: ChannelViewerCountSnapshot) => item.viewerCount > 0).length,
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
