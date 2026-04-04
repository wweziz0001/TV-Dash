import { describe, expect, it, vi } from "vitest";
import {
  syncPlayerMediaSession,
  type PlayerMediaSessionAction,
  type PlayerMediaSessionAdapter,
} from "./media-session";

class MockMediaMetadata {
  readonly init: {
    title: string;
    artist?: string;
    album?: string;
  };

  constructor(init: { title: string; artist?: string; album?: string }) {
    this.init = init;
  }
}

class MockMediaSession implements PlayerMediaSessionAdapter {
  metadata: unknown = null;
  playbackState: "none" | "paused" | "playing" = "none";
  readonly handlers = new Map<PlayerMediaSessionAction, ((details?: { seekOffset?: number }) => void) | null>();

  setActionHandler(
    action: PlayerMediaSessionAction,
    handler: ((details?: { seekOffset?: number }) => void) | null,
  ) {
    this.handlers.set(action, handler);
  }
}

describe("syncPlayerMediaSession", () => {
  it("publishes metadata and action handlers for supported playback actions", () => {
    const session = new MockMediaSession();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onStop = vi.fn();
    const onSeekBackward = vi.fn();
    const onSeekForward = vi.fn();

    const cleanup = syncPlayerMediaSession(session, MockMediaMetadata, {
      title: "Ops Feed",
      playbackState: "playing",
      canSeek: true,
      onPlay,
      onPause,
      onStop,
      onSeekBackward,
      onSeekForward,
    });

    expect(session.playbackState).toBe("playing");
    expect((session.metadata as MockMediaMetadata).init).toEqual({
      title: "Ops Feed",
      artist: "TV-Dash",
      album: "Live playback",
    });

    session.handlers.get("play")?.();
    session.handlers.get("pause")?.();
    session.handlers.get("stop")?.();
    session.handlers.get("seekbackward")?.({ seekOffset: 15 });
    session.handlers.get("seekforward")?.();

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSeekBackward).toHaveBeenCalledWith(15);
    expect(onSeekForward).toHaveBeenCalledWith(10);

    cleanup();

    expect(session.handlers.get("play")).toBeNull();
    expect(session.handlers.get("pause")).toBeNull();
    expect(session.handlers.get("stop")).toBeNull();
    expect(session.handlers.get("seekbackward")).toBeNull();
    expect(session.handlers.get("seekforward")).toBeNull();
  });

  it("clears seek actions when the live stream does not expose a real DVR window", () => {
    const session = new MockMediaSession();

    syncPlayerMediaSession(session, MockMediaMetadata, {
      title: "Live only",
      playbackState: "paused",
      canSeek: false,
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onStop: vi.fn(),
      onSeekBackward: vi.fn(),
      onSeekForward: vi.fn(),
    });

    expect(session.handlers.get("seekbackward")).toBeNull();
    expect(session.handlers.get("seekforward")).toBeNull();
  });
});
