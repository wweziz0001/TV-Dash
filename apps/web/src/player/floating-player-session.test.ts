import { describe, expect, it } from "vitest";
import {
  buildFloatingPlayerRoute,
  createFloatingPlayerSession,
  getFloatingPlayerSession,
  listFloatingPlayerSessions,
  removeFloatingPlayerSession,
  saveFloatingPlayerSession,
  updateFloatingPlayerSession,
} from "./floating-player-session";

function createStorage() {
  const data = new Map<string, string>();

  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

describe("floating-player-session", () => {
  it("creates a detachable floating-player session with a stable route target", () => {
    const session = createFloatingPlayerSession(
      {
        title: "Ops Feed",
        src: "https://example.com/live.m3u8",
        returnPath: "/multiview?channels=ops-feed",
        preferredQuality: "AUTO",
        muted: true,
        window: {
          left: 80,
          top: 40,
          width: 420,
          height: 236,
        },
      },
      new Date("2026-04-04T09:30:00.000Z"),
    );

    expect(session).toMatchObject({
      title: "Ops Feed",
      src: "https://example.com/live.m3u8",
      returnPath: "/multiview?channels=ops-feed",
      preferredQuality: "AUTO",
      muted: true,
      createdAt: "2026-04-04T09:30:00.000Z",
      updatedAt: "2026-04-04T09:30:00.000Z",
    });
    expect(session.id).toMatch(/\S+/);
    expect(buildFloatingPlayerRoute(session.id)).toBe(`/floating-player/${encodeURIComponent(session.id)}`);
  });

  it("stores, updates, lists, and removes floating-player sessions cleanly", () => {
    const storage = createStorage();
    const firstSession = createFloatingPlayerSession(
      {
        title: "Channel A",
        src: "https://example.com/a.m3u8",
        returnPath: "/watch/channel-a",
        window: {
          left: 24,
          top: 24,
          width: 420,
          height: 236,
        },
      },
      new Date("2026-04-04T08:00:00.000Z"),
    );
    const secondSession = createFloatingPlayerSession(
      {
        title: "Channel B",
        src: "https://example.com/b.m3u8",
        returnPath: "/watch/channel-b",
        window: {
          left: 52,
          top: 52,
          width: 420,
          height: 236,
        },
      },
      new Date("2026-04-04T08:01:00.000Z"),
    );

    saveFloatingPlayerSession(firstSession, storage);
    saveFloatingPlayerSession(secondSession, storage);

    expect(listFloatingPlayerSessions(storage).map((session) => session.title)).toEqual([
      "Channel A",
      "Channel B",
    ]);

    updateFloatingPlayerSession(
      firstSession.id,
      {
        muted: false,
        runtimeState: {
          status: "playing",
          isMuted: false,
          isPaused: false,
          volume: 0.45,
          canSeek: false,
          isAtLiveEdge: true,
          liveLatencySeconds: null,
          pictureInPictureMode: "detached",
          isFullscreenActive: false,
        },
      },
      storage,
      new Date("2026-04-04T08:02:00.000Z"),
    );

    expect(getFloatingPlayerSession(firstSession.id, storage)).toMatchObject({
      muted: false,
      updatedAt: "2026-04-04T08:02:00.000Z",
      runtimeState: {
        status: "playing",
        pictureInPictureMode: "detached",
      },
    });

    removeFloatingPlayerSession(firstSession.id, storage);

    expect(getFloatingPlayerSession(firstSession.id, storage)).toBeNull();
    expect(listFloatingPlayerSessions(storage)).toHaveLength(1);

    removeFloatingPlayerSession(secondSession.id, storage);

    expect(listFloatingPlayerSessions(storage)).toEqual([]);
    expect(storage.getItem("tv-dash:floating-player-sessions")).toBeNull();
  });
});
