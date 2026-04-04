export interface PlayerBrowserCapabilities {
  canFullscreen: boolean;
  canPictureInPicture: boolean;
  canDocumentPictureInPicture: boolean;
  canUseMediaSession: boolean;
  pictureInPictureUnavailableReason: string | null;
}

export interface PlayerSeekState {
  canSeek: boolean;
  rangeStart: number | null;
  rangeEnd: number | null;
  liveLatencySeconds: number | null;
  liveWindowSeconds: number | null;
  isAtLiveEdge: boolean;
}

type PictureInPictureDocument = Document & {
  pictureInPictureEnabled?: boolean;
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
};

type FullscreenDocument = Document & {
  fullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
};

const MIN_SEEKABLE_WINDOW_SECONDS = 10;
const LIVE_EDGE_TOLERANCE_SECONDS = 2;

export const defaultPlayerSeekState: PlayerSeekState = {
  canSeek: false,
  rangeStart: null,
  rangeEnd: null,
  liveLatencySeconds: null,
  liveWindowSeconds: null,
  isAtLiveEdge: true,
};

export function getPlayerBrowserCapabilities(
  video: HTMLVideoElement | null,
  fullscreenTarget: Element | null = null,
  doc: PictureInPictureDocument & FullscreenDocument = document,
  nav: Navigator = navigator,
  win: DocumentPictureInPictureWindow = window,
): PlayerBrowserCapabilities {
  const canUseMediaSession = "mediaSession" in nav && typeof nav.mediaSession !== "undefined";
  const canFullscreen = Boolean(fullscreenTarget?.requestFullscreen) && doc.fullscreenEnabled !== false;
  const canDocumentPictureInPicture = typeof win.documentPictureInPicture?.requestWindow === "function";

  if (!video) {
    return {
      canFullscreen,
      canPictureInPicture: false,
      canDocumentPictureInPicture,
      canUseMediaSession,
      pictureInPictureUnavailableReason: "Picture-in-Picture is unavailable until playback is ready.",
    };
  }

  if (video.disablePictureInPicture) {
    return {
      canFullscreen,
      canPictureInPicture: false,
      canDocumentPictureInPicture,
      canUseMediaSession,
      pictureInPictureUnavailableReason: "Picture-in-Picture is disabled for this player.",
    };
  }

  if (canDocumentPictureInPicture) {
    return {
      canFullscreen,
      canPictureInPicture: true,
      canDocumentPictureInPicture,
      canUseMediaSession,
      pictureInPictureUnavailableReason: null,
    };
  }

  if (typeof video.requestPictureInPicture !== "function") {
    return {
      canFullscreen,
      canPictureInPicture: false,
      canDocumentPictureInPicture,
      canUseMediaSession,
      pictureInPictureUnavailableReason: "Picture-in-Picture is not supported in this browser.",
    };
  }

  if (doc.pictureInPictureEnabled === false) {
    return {
      canFullscreen,
      canPictureInPicture: false,
      canDocumentPictureInPicture,
      canUseMediaSession,
      pictureInPictureUnavailableReason: "Picture-in-Picture is disabled in this browser.",
    };
  }

  return {
    canFullscreen,
    canPictureInPicture: true,
    canDocumentPictureInPicture,
    canUseMediaSession,
    pictureInPictureUnavailableReason: null,
  };
}

export function getPlayerSeekState(video: Pick<HTMLVideoElement, "currentTime" | "duration" | "seekable"> | null) {
  if (!video) {
    return defaultPlayerSeekState;
  }

  let rangeStart: number | null = null;
  let rangeEnd: number | null = null;

  if (video.seekable.length > 0) {
    rangeStart = video.seekable.start(0);
    rangeEnd = video.seekable.end(video.seekable.length - 1);
  } else if (Number.isFinite(video.duration) && video.duration > 0) {
    rangeStart = 0;
    rangeEnd = video.duration;
  }

  if (rangeStart === null || rangeEnd === null) {
    return defaultPlayerSeekState;
  }

  const liveWindowSeconds = Math.max(rangeEnd - rangeStart, 0);
  const canSeek = liveWindowSeconds >= MIN_SEEKABLE_WINDOW_SECONDS;
  const liveLatencySeconds = Math.max(rangeEnd - video.currentTime, 0);

  return {
    canSeek,
    rangeStart,
    rangeEnd,
    liveLatencySeconds,
    liveWindowSeconds,
    isAtLiveEdge: !canSeek || liveLatencySeconds <= LIVE_EDGE_TOLERANCE_SECONDS,
  };
}

export function seekVideoByOffset(
  video: Pick<HTMLVideoElement, "currentTime" | "duration" | "seekable"> | null,
  offsetSeconds: number,
) {
  if (!video) {
    return false;
  }

  const seekState = getPlayerSeekState(video);

  if (!seekState.canSeek || seekState.rangeStart === null || seekState.rangeEnd === null) {
    return false;
  }

  const nextTime = Math.min(
    seekState.rangeEnd,
    Math.max(seekState.rangeStart, video.currentTime + offsetSeconds),
  );

  if (Math.abs(nextTime - video.currentTime) < 0.25) {
    return false;
  }

  video.currentTime = nextTime;
  return true;
}

export function isPictureInPictureActive(
  video: HTMLVideoElement | null,
  doc: PictureInPictureDocument = document,
) {
  return Boolean(video && doc.pictureInPictureElement === video);
}

export function isFullscreenActive(
  fullscreenTarget: Element | null,
  doc: FullscreenDocument = document,
) {
  return Boolean(fullscreenTarget && doc.fullscreenElement === fullscreenTarget);
}
type DocumentPictureInPictureWindow = Window & {
  documentPictureInPicture?: {
    requestWindow?: (options?: {
      width?: number;
      height?: number;
      disallowReturnToOpener?: boolean;
      preferInitialWindowPlacement?: boolean;
    }) => Promise<Window>;
    window?: Window | null;
  };
};
