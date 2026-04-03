import { useEffect, useRef } from "react";
import type { DiagnosticFailureKind, PlaybackSessionState, PlaybackSessionType } from "@tv-dash/shared";
import { api } from "@/services/api";
import type { PlaybackSessionHeartbeatPayload } from "@/types/api";

const HEARTBEAT_INTERVAL_MS = 15_000;

export interface PlaybackSessionDescriptor {
  sessionKey: string;
  channelId: string;
  sessionType: PlaybackSessionType;
  playbackState: PlaybackSessionState;
  selectedQuality: string | null;
  isMuted: boolean;
  tileIndex?: number | null;
  failureKind?: DiagnosticFailureKind | null;
}

function createPlaybackSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

export function usePlaybackSessionHeartbeat(token: string | null, descriptors: PlaybackSessionDescriptor[]) {
  const sessionIdsByKeyRef = useRef(new Map<string, string>());
  const descriptorsRef = useRef(descriptors);
  const tokenRef = useRef(token);
  const previousKeysRef = useRef<string[]>([]);

  descriptorsRef.current = descriptors;
  tokenRef.current = token;

  function getSessionId(sessionKey: string) {
    const existingSessionId = sessionIdsByKeyRef.current.get(sessionKey);
    if (existingSessionId) {
      return existingSessionId;
    }

    const nextSessionId = createPlaybackSessionId();
    sessionIdsByKeyRef.current.set(sessionKey, nextSessionId);
    return nextSessionId;
  }

  async function sendHeartbeat(currentDescriptors: PlaybackSessionDescriptor[], keepalive = false) {
    if (!tokenRef.current || !currentDescriptors.length) {
      return;
    }

    const payload: PlaybackSessionHeartbeatPayload = {
      sessions: currentDescriptors.map((descriptor) => ({
        sessionId: getSessionId(descriptor.sessionKey),
        channelId: descriptor.channelId,
        sessionType: descriptor.sessionType,
        playbackState: descriptor.playbackState,
        selectedQuality: descriptor.selectedQuality,
        isMuted: descriptor.isMuted,
        tileIndex: descriptor.tileIndex ?? null,
        failureKind: descriptor.failureKind ?? null,
      })),
    };

    await api.heartbeatPlaybackSessions(payload, tokenRef.current, keepalive);
  }

  async function endSessionsForKeys(sessionKeys: string[], keepalive = false) {
    if (!tokenRef.current || !sessionKeys.length) {
      return;
    }

    const sessionIds = sessionKeys
      .map((sessionKey) => sessionIdsByKeyRef.current.get(sessionKey))
      .filter((sessionId): sessionId is string => Boolean(sessionId));

    if (!sessionIds.length) {
      return;
    }

    await api.endPlaybackSessions({ sessionIds }, tokenRef.current, keepalive);
    sessionKeys.forEach((sessionKey) => {
      sessionIdsByKeyRef.current.delete(sessionKey);
    });
  }

  useEffect(() => {
    if (!token) {
      previousKeysRef.current = [];
      sessionIdsByKeyRef.current.clear();
      return;
    }

    const currentKeys = descriptors.map((descriptor) => descriptor.sessionKey);
    const removedKeys = previousKeysRef.current.filter((sessionKey) => !currentKeys.includes(sessionKey));
    previousKeysRef.current = currentKeys;

    if (removedKeys.length) {
      void endSessionsForKeys(removedKeys);
    }

    if (descriptors.length) {
      void sendHeartbeat(descriptors);
    }

    const intervalId = window.setInterval(() => {
      void sendHeartbeat(descriptorsRef.current);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [descriptors, token]);

  useEffect(
    () => () => {
      const activeKeys = [...sessionIdsByKeyRef.current.keys()];

      if (activeKeys.length) {
        void endSessionsForKeys(activeKeys, true);
      }
    },
    [],
  );
}
