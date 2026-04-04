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
  it("reports in-page PiP, fullscreen, and media-session capabilities when playback is ready", () => {
    const video = {} as HTMLVideoElement;
    const fullscreenTarget = {
      requestFullscreen: vi.fn(),
    } as unknown as Element;
    const doc = {
      fullscreenEnabled: true,
    } as Document;
    const nav = {
      mediaSession: {},
    } as Navigator;
    const win = {} as unknown as Window;

    expect(getPlayerBrowserCapabilities(video, fullscreenTarget, doc, nav, win)).toEqual({
      canFullscreen: true,
      canPictureInPicture: true,
      canDocumentPictureInPicture: false,
      canUseMediaSession: true,
      pictureInPictureUnavailableReason: null,
    });
  });

  it("returns a clear PiP fallback reason when playback is not ready yet", () => {
    expect(getPlayerBrowserCapabilities(null, null, {} as Document, {} as Navigator)).toMatchObject({
      canPictureInPicture: false,
      canDocumentPictureInPicture: false,
      pictureInPictureUnavailableReason: "Picture-in-Picture is unavailable until playback is ready.",
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
