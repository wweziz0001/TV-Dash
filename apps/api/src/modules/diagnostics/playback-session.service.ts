import type {
  DiagnosticFailureKind,
  PlaybackSessionEndInput,
  PlaybackSessionHeartbeatInput,
} from "@tv-dash/shared";
import { writeStructuredLog } from "../../app/structured-log.js";
import { getChannelById } from "../channels/channel.service.js";
import {
  createOrUpdateActiveOperationalAlert,
  resolveOperationalAlertByDedupeKey,
} from "../alerts/alert.service.js";
import {
  countActivePlaybackFailuresByChannel,
  expireStalePlaybackSessions,
  findPlaybackSessionsByIds,
  markPlaybackSessionsEnded,
  type ExistingPlaybackSessionRecord,
  upsertPlaybackSession,
} from "./playback-session.repository.js";

export const ACTIVE_PLAYBACK_SESSION_TTL_MS = 45_000;
const PLAYBACK_FAILURE_ALERT_THRESHOLD = 3;
type PlaybackFailureKind = DiagnosticFailureKind;

function getStalePlaybackSessionCutoff(now: Date) {
  return new Date(now.getTime() - ACTIVE_PLAYBACK_SESSION_TTL_MS);
}

function buildPlaybackFailureAlertDedupeKey(channelId: string, failureKind: string) {
  return `playback-failure:${channelId}:${failureKind}`;
}

async function syncPlaybackFailureAlert(params: {
  channelId: string;
  failureKind: PlaybackFailureKind;
  activeFailureCount: number;
}) {
  const channel = await getChannelById(params.channelId);

  if (!channel) {
    return;
  }

  if (params.activeFailureCount < PLAYBACK_FAILURE_ALERT_THRESHOLD) {
    return;
  }

  await createOrUpdateActiveOperationalAlert({
    dedupeKey: buildPlaybackFailureAlertDedupeKey(params.channelId, params.failureKind),
    type: "PLAYBACK_FAILURE",
    category: "PLAYBACK",
    severity: params.activeFailureCount >= 5 ? "CRITICAL" : "ERROR",
    sourceSubsystem: "playback.monitoring",
    title: `${channel.name} playback failures affecting viewers`,
    message: `${params.activeFailureCount} active viewer surface(s) are currently erroring with ${params.failureKind}.`,
    relatedEntityType: "PLAYBACK_CLUSTER",
    relatedEntityId: params.channelId,
    metadata: {
      channelName: channel.name,
      channelSlug: channel.slug,
      failureKind: params.failureKind,
      activeFailureCount: params.activeFailureCount,
    },
  });
}

async function resolvePlaybackFailureAlert(params: {
  channelId: string;
  failureKind: PlaybackFailureKind;
}) {
  const channel = await getChannelById(params.channelId);

  if (!channel) {
    return;
  }

  await resolveOperationalAlertByDedupeKey({
    dedupeKey: buildPlaybackFailureAlertDedupeKey(params.channelId, params.failureKind),
    resolutionNotification: {
      type: "PLAYBACK_RECOVERED",
      category: "PLAYBACK",
      severity: "SUCCESS",
      sourceSubsystem: "playback.monitoring",
      title: `${channel.name} playback recovered`,
      message: `Active viewer playback failures cleared for ${channel.name}.`,
      relatedEntityType: "PLAYBACK_CLUSTER",
      relatedEntityId: params.channelId,
      metadata: {
        channelName: channel.name,
        channelSlug: channel.slug,
        failureKind: params.failureKind,
      },
    },
  });
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

      if (session.channelId && session.failureKind) {
        const failureKind = session.failureKind as PlaybackFailureKind;
        void countActivePlaybackFailuresByChannel({
          channelId: session.channelId,
          failureKind,
          staleAfter: getStalePlaybackSessionCutoff(observedAt),
        })
          .then((activeFailureCount) =>
            syncPlaybackFailureAlert({
              channelId: session.channelId,
              failureKind,
              activeFailureCount,
            }),
          )
          .catch(() => undefined);
      }
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

      const previousFailureKind = previous.failureKind as PlaybackFailureKind | null;

      if (session.channelId && previousFailureKind) {
        void countActivePlaybackFailuresByChannel({
          channelId: session.channelId,
          failureKind: previousFailureKind,
          staleAfter: getStalePlaybackSessionCutoff(observedAt),
        })
          .then((activeFailureCount) => {
            if (activeFailureCount === 0) {
              return resolvePlaybackFailureAlert({
                channelId: session.channelId,
                failureKind: previousFailureKind,
              });
            }

            return undefined;
          })
          .catch(() => undefined);
      }
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

    const failureKind = session.failureKind as PlaybackFailureKind | null;

    const channelId = session.channelId;

    if (channelId && session.playbackState === "error" && failureKind) {
      void countActivePlaybackFailuresByChannel({
        channelId,
        failureKind,
        staleAfter: getStalePlaybackSessionCutoff(endedAt),
      })
        .then((activeFailureCount) => {
          if (activeFailureCount === 0) {
            return resolvePlaybackFailureAlert({
              channelId,
              failureKind,
            });
          }

          return undefined;
        })
        .catch(() => undefined);
    }
  });
}
