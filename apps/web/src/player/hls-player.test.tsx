import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mediaPaused = true;

const { MockHls } = vi.hoisted(() => {
  class MockHls {
    static instances: MockHls[] = [];
    static isSupported = vi.fn(() => true);
    static Events = {
      MEDIA_ATTACHED: "mediaAttached",
      MANIFEST_PARSED: "manifestParsed",
      LEVELS_UPDATED: "levelsUpdated",
      LEVEL_SWITCHED: "levelSwitched",
      ERROR: "error",
    };
    static ErrorTypes = {
      NETWORK_ERROR: "networkError",
      MEDIA_ERROR: "mediaError",
    };

    autoLevelEnabled = true;
    currentLevel = -1;
    levels: Array<{ height?: number; bitrate?: number }> = [];
    readonly listeners = new Map<string, Set<(event: string, data?: any) => void>>();
    readonly attachMedia = vi.fn(() => {
      queueMicrotask(() => {
        this.emit(MockHls.Events.MEDIA_ATTACHED);
      });
    });
    readonly loadSource = vi.fn();
    readonly on = vi.fn((event: string, handler: (event: string, data?: any) => void) => {
      const handlers = this.listeners.get(event) ?? new Set();
      handlers.add(handler);
      this.listeners.set(event, handlers);
    });
    readonly startLoad = vi.fn();
    readonly recoverMediaError = vi.fn();
    readonly destroy = vi.fn(() => {
      this.listeners.clear();
    });

    constructor() {
      MockHls.instances.push(this);
    }

    emit(event: string, data?: any) {
      const handlers = [...(this.listeners.get(event) ?? [])];
      handlers.forEach((handler) => handler(event, data));
    }
  }

  return { MockHls };
});

vi.mock("hls.js", () => ({
  default: MockHls,
}));

import { HlsPlayer } from "./hls-player";

describe("HlsPlayer", () => {
  beforeEach(() => {
    MockHls.instances = [];
    MockHls.isSupported.mockReturnValue(true);
    mediaPaused = true;

    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get() {
        return mediaPaused;
      },
    });

    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async function (this: HTMLMediaElement) {
      mediaPaused = false;
      this.dispatchEvent(new Event("play"));
      this.dispatchEvent(new Event("playing"));
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
      mediaPaused = true;
      this.dispatchEvent(new Event("pause"));
    });

    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      value: null,
      writable: true,
    });
    Object.defineProperty(document, "exitPictureInPicture", {
      configurable: true,
      value: vi.fn(async () => {
        Object.defineProperty(document, "pictureInPictureElement", {
          configurable: true,
          value: null,
          writable: true,
        });
      }),
    });
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
      writable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn(async () => {
        Object.defineProperty(document, "fullscreenElement", {
          configurable: true,
          value: null,
          writable: true,
        });
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });
    Object.defineProperty(HTMLVideoElement.prototype, "requestPictureInPicture", {
      configurable: true,
      value: vi.fn(async function (this: HTMLVideoElement) {
        Object.defineProperty(document, "pictureInPictureElement", {
          configurable: true,
          value: this,
          writable: true,
        });
        this.dispatchEvent(new Event("enterpictureinpicture"));
        return {};
      }),
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: vi.fn(async function (this: HTMLElement) {
        Object.defineProperty(document, "fullscreenElement", {
          configurable: true,
          value: this,
          writable: true,
        });
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("bounds reconnect timers so repeated network failures do not stack duplicate retries", () => {
    render(<HlsPlayer src="https://example.com/a.m3u8" title="Channel A" />);

    const instance = MockHls.instances[0];

    act(() => {
      instance.emit(MockHls.Events.ERROR, {
        fatal: true,
        type: MockHls.ErrorTypes.NETWORK_ERROR,
        details: "manifestLoadError",
      });
      instance.emit(MockHls.Events.ERROR, {
        fatal: true,
        type: MockHls.ErrorTypes.NETWORK_ERROR,
        details: "manifestLoadError",
      });
      vi.advanceTimersByTime(3000);
    });

    expect(instance.startLoad).toHaveBeenCalledTimes(1);
  });

  it("clears stale retry timers and destroys the previous player when the source changes", () => {
    const { rerender, unmount } = render(<HlsPlayer src="https://example.com/a.m3u8" title="Channel A" />);

    const firstInstance = MockHls.instances[0];

    act(() => {
      firstInstance.emit(MockHls.Events.ERROR, {
        fatal: true,
        type: MockHls.ErrorTypes.NETWORK_ERROR,
        details: "manifestLoadError",
      });
    });

    act(() => {
      rerender(<HlsPlayer src="https://example.com/b.m3u8" title="Channel B" />);
    });

    act(() => {
      vi.runAllTicks();
    });

    const secondInstance = MockHls.instances[1];

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(MockHls.instances).toHaveLength(2);
    expect(firstInstance.destroy).toHaveBeenCalledTimes(1);
    expect(firstInstance.startLoad).not.toHaveBeenCalled();

    unmount();

    expect(secondInstance.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not recreate playback when only the preferred quality changes", () => {
    const { rerender } = render(
      <HlsPlayer preferredQuality="AUTO" src="https://example.com/a.m3u8" title="Channel A" />,
    );

    const instance = MockHls.instances[0];

    act(() => {
      instance.emit(MockHls.Events.MANIFEST_PARSED, {
        levels: [{ height: 1080 }, { height: 720 }],
      });
    });

    act(() => {
      rerender(<HlsPlayer preferredQuality="1" src="https://example.com/a.m3u8" title="Channel A" />);
    });

    expect(MockHls.instances).toHaveLength(1);
    expect(instance.destroy).not.toHaveBeenCalled();
    expect(instance.currentLevel).toBe(1);
  });

  it("does not recreate playback when multiview audio handoff only changes mute state and startup bias", () => {
    const { container, rerender } = render(
      <HlsPlayer
        initialBias="AUTO"
        muted={false}
        src="https://example.com/a.m3u8"
        title="Channel A"
      />,
    );

    const instance = MockHls.instances[0];
    const video = container.querySelector("video");

    act(() => {
      instance.emit(MockHls.Events.MEDIA_ATTACHED);
    });

    expect(instance.loadSource).toHaveBeenCalledTimes(1);
    expect(video?.muted).toBe(false);

    act(() => {
      rerender(
        <HlsPlayer
          initialBias="LOWEST"
          muted
          src="https://example.com/a.m3u8"
          title="Channel A"
        />,
      );
    });

    expect(MockHls.instances).toHaveLength(1);
    expect(instance.destroy).not.toHaveBeenCalled();
    expect(instance.loadSource).toHaveBeenCalledTimes(1);
    expect(video?.muted).toBe(true);
  });

  it("keeps manual quality selection when hls reports a level switch", () => {
    const handleSelectedQualityChange = vi.fn();
    const { rerender } = render(
      <HlsPlayer
        onSelectedQualityChange={handleSelectedQualityChange}
        preferredQuality="AUTO"
        src="https://example.com/a.m3u8"
        title="Channel A"
      />,
    );

    const instance = MockHls.instances[0];

    act(() => {
      instance.emit(MockHls.Events.MANIFEST_PARSED, {
        levels: [{ height: 1080 }, { height: 720 }],
      });
    });

    handleSelectedQualityChange.mockClear();

    act(() => {
      rerender(
        <HlsPlayer
          onSelectedQualityChange={handleSelectedQualityChange}
          preferredQuality="1"
          src="https://example.com/a.m3u8"
          title="Channel A"
        />,
      );
    });

    act(() => {
      instance.autoLevelEnabled = true;
      instance.currentLevel = 1;
      instance.emit(MockHls.Events.LEVEL_SWITCHED, { level: 1 });
    });

    expect(handleSelectedQualityChange).toHaveBeenLastCalledWith("1");
  });

  it("renders explicit in-player controls and reports pause, mute, PiP, and fullscreen state", async () => {
    const handleMutedChange = vi.fn();
    const handleDiagnosticsChange = vi.fn();

    const { container } = render(
      <HlsPlayer
        muted={false}
        onDiagnosticsChange={handleDiagnosticsChange}
        onMutedChange={handleMutedChange}
        src="https://example.com/a.m3u8"
        title="Channel A"
      />,
    );

    act(() => {
      MockHls.instances[0].emit(MockHls.Events.MANIFEST_PARSED, {
        levels: [{ height: 1080 }, { height: 720 }],
      });
    });

    const video = container.querySelector("video") as HTMLVideoElement;

    Object.defineProperty(video, "seekable", {
      configurable: true,
      value: {
        length: 1,
        start: () => 100,
        end: () => 160,
      },
    });
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      value: 120,
      writable: true,
    });

    fireEvent(video, new Event("loadedmetadata"));
    fireEvent(video, new Event("timeupdate"));
    const playerRoot = screen.getByTestId("player-surface");
    fireEvent.mouseOver(playerRoot);
    fireEvent.mouseMove(playerRoot);

    expect(screen.getByRole("button", { name: "Pause playback" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Player volume" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Player timeline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jump to live" })).toBeInTheDocument();
    expect(screen.getByText("00:20")).toBeInTheDocument();
    expect(screen.getByText("01:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Picture-in-Picture" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Mute audio" }));
    expect(handleMutedChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Jump to live" }));
    expect(video.currentTime).toBe(160);

    fireEvent.click(screen.getByRole("button", { name: "Pause playback" }));
    expect(screen.getAllByText("Paused").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    expect(screen.getByText("Fullscreen")).toBeInTheDocument();

    expect(handleDiagnosticsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isPaused: true,
        canPictureInPicture: true,
        isFullscreenActive: true,
        pictureInPictureMode: "none",
      }),
    );
  });

  it("shows player chrome on hover and hides it after inactivity or mouse leave", () => {
    render(<HlsPlayer src="https://example.com/a.m3u8" title="Channel A" />);

    const playerRoot = screen.getByTestId("player-surface");
    const statusChrome = screen.getByTestId("player-status-chrome");
    const controlOverlay = screen.getByTestId("player-control-overlay");

    expect(statusChrome).toHaveClass("opacity-0");
    expect(controlOverlay).toHaveClass("opacity-0");

    fireEvent.mouseOver(playerRoot);
    fireEvent.mouseMove(playerRoot);

    expect(statusChrome).toHaveClass("opacity-100");
    expect(controlOverlay).toHaveClass("opacity-100");

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(statusChrome).toHaveClass("opacity-0");
    expect(controlOverlay).toHaveClass("opacity-0");

    fireEvent.mouseOver(playerRoot);
    fireEvent.mouseMove(playerRoot);

    expect(statusChrome).toHaveClass("opacity-100");
    expect(controlOverlay).toHaveClass("opacity-100");

    fireEvent.mouseLeave(playerRoot);

    expect(statusChrome).toHaveClass("opacity-0");
    expect(controlOverlay).toHaveClass("opacity-0");
  });

  it("opens native video picture-in-picture without moving playback into a separate document", async () => {
    render(<HlsPlayer src="https://example.com/a.m3u8" title="Channel A" />);

    act(() => {
      MockHls.instances[0].emit(MockHls.Events.MANIFEST_PARSED, {
        levels: [{ height: 1080 }, { height: 720 }],
      });
    });

    const playerRoot = screen.getByTestId("player-surface");
    fireEvent.mouseOver(playerRoot);
    fireEvent.mouseMove(playerRoot);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open Picture-in-Picture" }));
      await Promise.resolve();
    });

    expect(HTMLVideoElement.prototype.requestPictureInPicture).toHaveBeenCalledTimes(1);
    expect(document.pictureInPictureElement).toBeTruthy();
  });
});
