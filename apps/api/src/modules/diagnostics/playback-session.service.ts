import type {
  PlaybackSessionEndInput,
  PlaybackSessionHeartbeatInput,
} from "@tv-dash/shared";
import { writeStructuredLog } from "../../app/structured-log.js";
import {
  expireStalePlaybackSessions,
  findPlaybackSessionsByIds,
  markPlaybackSessionsEnded,
  type ExistingPlaybackSessionRecord,
  upsertPlaybackSession,
} from "./playback-session.repository.js";

export const ACTIVE_PLAYBACK_SESSION_TTL_MS = 45_000;

function getStalePlaybackSessionCutoff(now: Date) {
  return new Date(now.getTime() - ACTIVE_PLAYBACK_SESSION_TTL_MS);
}

export async function cleanupStalePlaybackSessions(now = new Date()) {
  return expireStalePlaybackSessions(getStalePlaybackSessionCutoff(now), now);
}

export async function recordPlaybackSessionHeartbeat(userId: string, payload: PlaybackSessionHeartbeatInput) {
  const observedAt = new Date();
  await cleanupStalePlaybackSessions(observedAt);

  const existingSessions = await findPlaybackSessionsByIds(
    payload.sessions.map((session) => session.sessionId),
  );
  const existingSessionMap = new Map<string, ExistingPlaybackSessionRecord>(
    existingSessions.map((session) => [session.id, session]),
  );

  for (const existingSession of existingSessions) {
    if (existingSession.userId !== userId) {
      throw new Error("Playback session ownership mismatch");
    }
  }

  for (const session of payload.sessions) {
    const previous = existingSessionMap.get(session.sessionId) ?? null;

    await upsertPlaybackSession({
      sessionId: session.sessionId,
      surfaceId: session.surfaceId,
      userId,
      channelId: session.channelId,
      sessionType: session.sessionType,
      playbackState: session.playbackState,
      playbackPositionState: session.playbackPositionState,
      liveOffsetSeconds: session.liveOffsetSeconds,
      selectedQuality: session.selectedQuality,
      isMuted: session.isMuted,
      tileIndex: session.tileIndex,
      failureKind: session.failureKind,
      observedAt,
    });

    if (!previous) {
      writeStructuredLog("info", {
        event: "playback.session.started",
        actorUserId: userId,
        channelId: session.channelId,
        sessionId: session.sessionId,
        detail: {
          surfaceId: session.surfaceId,
          sessionType: session.sessionType,
          playbackState: session.playbackState,
          playbackPositionState: session.playbackPositionState,
          liveOffsetSeconds: session.liveOffsetSeconds,
          tileIndex: session.tileIndex,
          quality: session.selectedQuality,
          isMuted: session.isMuted,
        },
      });
      continue;
    }

    if (previous.channelId !== session.channelId) {
      writeStructuredLog("info", {
        event: "playback.session.channel.changed",
        actorUserId: userId,
        channelId: session.channelId,
        sessionId: session.sessionId,
        detail: {
          previousChannelId: previous.channelId,
          surfaceId: previous.surfaceId ?? session.surfaceId,
          sessionType: session.sessionType,
          tileIndex: session.tileIndex,
        },
      });
    }

    if (
      previous.playbackPositionState !== session.playbackPositionState ||
      previous.liveOffsetSeconds !== session.liveOffsetSeconds
    ) {
      writeStructuredLog("info", {
        event: "playback.session.position.changed",
        actorUserId: userId,
        channelId: session.channelId,
        sessionId: session.sessionId,
        detail: {
          surfaceId: previous.surfaceId ?? session.surfaceId,
          sessionType: session.sessionType,
          tileIndex: session.tileIndex,
          previousPlaybackPositionState: previous.playbackPositionState,
          playbackPositionState: session.playbackPositionState,
          previousLiveOffsetSeconds: previous.liveOffsetSeconds,
          liveOffsetSeconds: session.liveOffsetSeconds,
        },
      });
    }

    const movedIntoError = previous.playbackState !== "error" && session.playbackState === "error";
    const recoveredFromError = previous.playbackState === "error" && session.playbackState !== "error";

    if (movedIntoError) {
      writeStructuredLog("warn", {
        event: "playback.session.failed",
        actorUserId: userId,
        channelId: session.channelId,
        sessionId: session.sessionId,
        failureKind: session.failureKind ?? "unknown",
        detail: {
          surfaceId: previous.surfaceId ?? session.surfaceId,
          sessionType: session.sessionType,
          tileIndex: session.tileIndex,
          quality: session.selectedQuality,
        },
      });
    }

    if (recoveredFromError) {
      writeStructuredLog("info", {
        event: "playback.session.recovered",
        actorUserId: userId,
        channelId: session.channelId,
        sessionId: session.sessionId,
        detail: {
          surfaceId: previous.surfaceId ?? session.surfaceId,
          sessionType: session.sessionType,
          tileIndex: session.tileIndex,
          previousFailureKind: previous.failureKind,
          playbackPositionState: session.playbackPositionState,
          liveOffsetSeconds: session.liveOffsetSeconds,
        },
      });
    }
  }
}

export async function endPlaybackSessionsForUser(userId: string, payload: PlaybackSessionEndInput) {
  const endedAt = new Date();
  const existingSessions = await findPlaybackSessionsByIds(payload.sessionIds);
  const ownSessions = existingSessions.filter(
    (session: ExistingPlaybackSessionRecord) => session.userId === userId && !session.endedAt,
  );

  if (!ownSessions.length) {
    return;
  }

  await markPlaybackSessionsEnded(userId, ownSessions.map((session) => session.id), endedAt);

  ownSessions.forEach((session) => {
    writeStructuredLog("info", {
      event: "playback.session.ended",
      actorUserId: userId,
      channelId: session.channelId ?? undefined,
      sessionId: session.id,
        detail: {
          surfaceId: session.surfaceId ?? null,
          sessionType: session.sessionType,
          finalState: session.playbackState,
          finalPlaybackPositionState: session.playbackPositionState,
          liveOffsetSeconds: session.liveOffsetSeconds,
          tileIndex: session.tileIndex,
          durationSeconds: Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000)),
        },
    });
  });
}
