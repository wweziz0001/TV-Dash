type PlayerMediaSessionPlaybackState = "none" | "paused" | "playing";
export type PlayerMediaSessionAction = "play" | "pause" | "stop" | "seekbackward" | "seekforward";

interface PlayerMediaSessionActionDetails {
  seekOffset?: number;
}

export interface PlayerMediaSessionAdapter {
  metadata: unknown;
  playbackState?: PlayerMediaSessionPlaybackState;
  setActionHandler: (
    action: PlayerMediaSessionAction,
    handler: ((details?: PlayerMediaSessionActionDetails) => void) | null,
  ) => void;
}

interface PlayerMediaMetadataInit {
  title: string;
  artist?: string;
  album?: string;
}

export interface PlayerMediaMetadataConstructor {
  new (init: PlayerMediaMetadataInit): unknown;
}

export interface SyncPlayerMediaSessionOptions {
  title: string;
  playbackState: PlayerMediaSessionPlaybackState;
  canSeek: boolean;
  seekOffsetSeconds?: number;
  onPlay: () => Promise<void> | void;
  onPause: () => void;
  onStop: () => void;
  onSeekBackward: (seekOffsetSeconds: number) => void;
  onSeekForward: (seekOffsetSeconds: number) => void;
}

const DEFAULT_SEEK_OFFSET_SECONDS = 10;

function setMediaSessionActionHandler(
  session: PlayerMediaSessionAdapter,
  action: PlayerMediaSessionAction,
  handler: ((details?: PlayerMediaSessionActionDetails) => void) | null,
) {
  try {
    session.setActionHandler(action, handler);
  } catch {
    // Browsers may expose Media Session while supporting only a subset of actions.
  }
}

export function syncPlayerMediaSession(
  session: PlayerMediaSessionAdapter | null | undefined,
  MediaMetadataCtor: PlayerMediaMetadataConstructor | undefined,
  {
    title,
    playbackState,
    canSeek,
    seekOffsetSeconds = DEFAULT_SEEK_OFFSET_SECONDS,
    onPlay,
    onPause,
    onStop,
    onSeekBackward,
    onSeekForward,
  }: SyncPlayerMediaSessionOptions,
) {
  if (!session) {
    return () => undefined;
  }

  session.playbackState = playbackState;

  if (MediaMetadataCtor) {
    session.metadata = new MediaMetadataCtor({
      title,
      artist: "TV-Dash",
      album: "Live playback",
    });
  }

  setMediaSessionActionHandler(session, "play", () => {
    void onPlay();
  });
  setMediaSessionActionHandler(session, "pause", () => {
    onPause();
  });
  setMediaSessionActionHandler(session, "stop", () => {
    onStop();
  });

  if (canSeek) {
    setMediaSessionActionHandler(session, "seekbackward", (details) => {
      onSeekBackward(details?.seekOffset ?? seekOffsetSeconds);
    });
    setMediaSessionActionHandler(session, "seekforward", (details) => {
      onSeekForward(details?.seekOffset ?? seekOffsetSeconds);
    });
  } else {
    setMediaSessionActionHandler(session, "seekbackward", null);
    setMediaSessionActionHandler(session, "seekforward", null);
  }

  return () => {
    setMediaSessionActionHandler(session, "play", null);
    setMediaSessionActionHandler(session, "pause", null);
    setMediaSessionActionHandler(session, "stop", null);
    setMediaSessionActionHandler(session, "seekbackward", null);
    setMediaSessionActionHandler(session, "seekforward", null);
  };
}
