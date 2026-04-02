import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
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
});
