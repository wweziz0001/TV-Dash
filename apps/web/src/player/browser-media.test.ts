import { describe, expect, it, vi } from "vitest";
import {
  getPlayerBrowserCapabilities,
  getPlayerSeekState,
  seekVideoByOffset,
} from "./browser-media";

function createSeekableRange(start: number, end: number): TimeRanges {
  return {
    length: 1,
    start: () => start,
    end: () => end,
  } as TimeRanges;
}

describe("browser-media", () => {
  it("reports PiP, fullscreen, and media-session capabilities when the browser supports them", () => {
    const video = {
      disablePictureInPicture: false,
      requestPictureInPicture: vi.fn(),
    } as unknown as HTMLVideoElement;
    const fullscreenTarget = {
      requestFullscreen: vi.fn(),
    } as unknown as Element;
    const doc = {
      pictureInPictureEnabled: true,
      fullscreenEnabled: true,
    } as Document;
    const nav = {
      mediaSession: {},
    } as Navigator;
    const win = {
      documentPictureInPicture: {
        requestWindow: vi.fn(),
      },
    } as unknown as Window;

    expect(getPlayerBrowserCapabilities(video, fullscreenTarget, doc, nav, win)).toEqual({
      canFullscreen: true,
      canPictureInPicture: true,
      canDocumentPictureInPicture: true,
      canUseMediaSession: true,
      pictureInPictureUnavailableReason: null,
    });
  });

  it("returns a clear PiP fallback reason when the browser does not expose the API", () => {
    const video = {
      disablePictureInPicture: false,
    } as HTMLVideoElement;

    expect(
      getPlayerBrowserCapabilities(video, null, { pictureInPictureEnabled: true } as Document, {} as Navigator),
    ).toMatchObject({
      canPictureInPicture: false,
      canDocumentPictureInPicture: false,
      pictureInPictureUnavailableReason: "Picture-in-Picture is not supported in this browser.",
    });
  });

  it("derives DVR seek state from the live seekable range and clamps seek operations inside that window", () => {
    const video = {
      currentTime: 150,
      duration: Number.POSITIVE_INFINITY,
      seekable: createSeekableRange(100, 160),
    } as Pick<HTMLVideoElement, "currentTime" | "duration" | "seekable">;

    expect(getPlayerSeekState(video)).toMatchObject({
      canSeek: true,
      rangeStart: 100,
      rangeEnd: 160,
      liveLatencySeconds: 10,
      isAtLiveEdge: false,
    });

    expect(seekVideoByOffset(video, 30)).toBe(true);
    expect(video.currentTime).toBe(160);

    expect(seekVideoByOffset(video, -80)).toBe(true);
    expect(video.currentTime).toBe(100);
  });

  it("treats short or missing seek windows as live-only playback", () => {
    const shortWindowVideo = {
      currentTime: 9,
      duration: 12,
      seekable: createSeekableRange(0, 9),
    } as Pick<HTMLVideoElement, "currentTime" | "duration" | "seekable">;

    expect(getPlayerSeekState(shortWindowVideo)).toMatchObject({
      canSeek: false,
      isAtLiveEdge: true,
    });
    expect(seekVideoByOffset(shortWindowVideo, -10)).toBe(false);
  });
});
