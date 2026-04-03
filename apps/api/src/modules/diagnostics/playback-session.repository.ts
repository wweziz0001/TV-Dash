import type { DiagnosticFailureKind, PlaybackSessionState, PlaybackSessionType } from "@tv-dash/shared";
import { prisma } from "../../db/prisma.js";

const activePlaybackSessionSelect = {
  id: true,
  userId: true,
  channelId: true,
  sessionType: true,
  playbackState: true,
  selectedQuality: true,
  isMuted: true,
  tileIndex: true,
  failureKind: true,
  startedAt: true,
  lastSeenAt: true,
  endedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      role: true,
    },
  },
  channel: {
    select: {
      id: true,
      name: true,
      slug: true,
      playbackMode: true,
      sourceMode: true,
      isActive: true,
    },
  },
};

const existingPlaybackSessionSelect = {
  id: true,
  userId: true,
  channelId: true,
  sessionType: true,
  playbackState: true,
  selectedQuality: true,
  isMuted: true,
  tileIndex: true,
  failureKind: true,
  startedAt: true,
  lastSeenAt: true,
  endedAt: true,
};

interface UpsertPlaybackSessionInput {
  sessionId: string;
  userId: string;
  channelId: string;
  sessionType: PlaybackSessionType;
  playbackState: PlaybackSessionState;
  selectedQuality: string | null;
  isMuted: boolean;
  tileIndex: number | null;
  failureKind: DiagnosticFailureKind | null;
  observedAt: Date;
}

function mapPlaybackSessionPersistenceInput(input: UpsertPlaybackSessionInput) {
  return {
    userId: input.userId,
    channelId: input.channelId,
    sessionType: input.sessionType,
    playbackState: input.playbackState,
    selectedQuality: input.selectedQuality,
    isMuted: input.isMuted,
    tileIndex: input.tileIndex,
    failureKind: input.failureKind,
    lastSeenAt: input.observedAt,
    endedAt: null,
  };
}

export function findPlaybackSessionsByIds(sessionIds: string[]) {
  return prisma.playbackSession.findMany({
    where: {
      id: {
        in: sessionIds,
      },
    },
    select: existingPlaybackSessionSelect,
  });
}

export function upsertPlaybackSession(input: UpsertPlaybackSessionInput) {
  const persisted = mapPlaybackSessionPersistenceInput(input);

  return prisma.playbackSession.upsert({
    where: {
      id: input.sessionId,
    },
    update: {
      channelId: persisted.channelId,
      sessionType: persisted.sessionType,
      playbackState: persisted.playbackState,
      selectedQuality: persisted.selectedQuality,
      isMuted: persisted.isMuted,
      tileIndex: persisted.tileIndex,
      failureKind: persisted.failureKind,
      lastSeenAt: persisted.lastSeenAt,
      endedAt: null,
    },
    create: {
      id: input.sessionId,
      ...persisted,
      startedAt: input.observedAt,
    },
    select: existingPlaybackSessionSelect,
  });
}

export function markPlaybackSessionsEnded(userId: string, sessionIds: string[], endedAt: Date) {
  return prisma.playbackSession.updateMany({
    where: {
      id: {
        in: sessionIds,
      },
      userId,
      endedAt: null,
    },
    data: {
      endedAt,
      lastSeenAt: endedAt,
    },
  });
}

export function expireStalePlaybackSessions(staleBefore: Date, endedAt: Date) {
  return prisma.playbackSession.updateMany({
    where: {
      endedAt: null,
      lastSeenAt: {
        lt: staleBefore,
      },
    },
    data: {
      endedAt,
    },
  });
}

export function listActivePlaybackSessions(staleAfter: Date) {
  return prisma.playbackSession.findMany({
    where: {
      endedAt: null,
      channelId: {
        not: null,
      },
      lastSeenAt: {
        gte: staleAfter,
      },
    },
    orderBy: [{ lastSeenAt: "desc" }, { startedAt: "asc" }],
    select: activePlaybackSessionSelect,
  });
}

export type ExistingPlaybackSessionRecord = Awaited<ReturnType<typeof findPlaybackSessionsByIds>>[number];
export type ActivePlaybackSessionRecord = Awaited<ReturnType<typeof listActivePlaybackSessions>>[number];
