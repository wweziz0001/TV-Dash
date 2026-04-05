import { describe, expect, it } from "vitest";
import { buildPlayerTimeshiftUiModel } from "./timeshift-ui";

describe("timeshift-ui", () => {
  it("reports live-edge DVR playback with an interactive timeline", () => {
    const model = buildPlayerTimeshiftUiModel({
      diagnostics: {
        isPaused: false,
        isAtLiveEdge: true,
        liveLatencySeconds: 0,
        timeshiftSupported: true,
        timeshiftAvailable: true,
      },
      timeshiftStatus: {
        channelId: "channel-1",
        configured: true,
        supported: true,
        available: true,
        acquisitionMode: "SHARED_SESSION",
        bufferState: "READY",
        message: "Ready",
        windowSeconds: 1800,
        minimumReadyWindowSeconds: 30,
        availableWindowSeconds: 300,
        availableFromAt: "2026-04-04T23:55:00.000Z",
        availableUntilAt: "2026-04-05T00:00:00.000Z",
        bufferedSegmentCount: 40,
        lastUpdatedAt: "2026-04-05T00:00:00.000Z",
        lastError: null,
      },
      seekState: {
        canSeek: true,
        rangeStart: 100,
        rangeEnd: 400,
        liveWindowSeconds: 300,
      },
      currentTime: 400,
    });

    expect(model).toMatchObject({
      state: "LIVE_EDGE",
      capabilityLabel: "DVR ready",
      liveStateLabel: "LIVE",
      viewerPositionLabel: "At live edge",
      timelineInteractive: true,
      timelineCurrentLabel: "Playhead LIVE",
      goLiveRecommended: false,
    });
  });

  it("reports paused playback behind live with a Go Live recommendation", () => {
    const model = buildPlayerTimeshiftUiModel({
      diagnostics: {
        isPaused: true,
        isAtLiveEdge: false,
        liveLatencySeconds: 92,
        timeshiftSupported: true,
        timeshiftAvailable: true,
      },
      timeshiftStatus: {
        channelId: "channel-1",
        configured: true,
        supported: true,
        available: true,
        acquisitionMode: "DIRECT_UPSTREAM",
        bufferState: "READY",
        message: "Ready",
        windowSeconds: 1800,
        minimumReadyWindowSeconds: 30,
        availableWindowSeconds: 300,
        availableFromAt: "2026-04-04T23:55:00.000Z",
        availableUntilAt: "2026-04-05T00:00:00.000Z",
        bufferedSegmentCount: 40,
        lastUpdatedAt: "2026-04-05T00:00:00.000Z",
        lastError: null,
      },
      seekState: {
        canSeek: true,
        rangeStart: 100,
        rangeEnd: 400,
        liveWindowSeconds: 300,
      },
      currentTime: 308,
    });

    expect(model).toMatchObject({
      state: "PAUSED",
      liveStateLabel: "PAUSED",
      viewerPositionLabel: "01:32 behind live",
      timelineCurrentLabel: "Paused -01:32",
      goLiveLabel: "Go Live",
      goLiveRecommended: true,
    });
  });

  it("shows a warming buffer bar without exposing fake seek controls", () => {
    const model = buildPlayerTimeshiftUiModel({
      diagnostics: {
        isPaused: false,
        isAtLiveEdge: true,
        liveLatencySeconds: 0,
        timeshiftSupported: true,
        timeshiftAvailable: false,
      },
      timeshiftStatus: {
        channelId: "channel-1",
        configured: true,
        supported: true,
        available: false,
        acquisitionMode: "SHARED_SESSION",
        bufferState: "WARMING",
        message: "DVR ready in ~18s.",
        windowSeconds: 1800,
        minimumReadyWindowSeconds: 30,
        availableWindowSeconds: 12,
        availableFromAt: null,
        availableUntilAt: null,
        bufferedSegmentCount: 2,
        lastUpdatedAt: "2026-04-05T00:00:00.000Z",
        lastError: null,
      },
    });

    expect(model).toMatchObject({
      state: "WARMING",
      capabilityLabel: "DVR warming",
      viewerPositionLabel: "Buffer warming",
      timelineInteractive: false,
      bufferWindowLabel: "Retained 00:12 of 30:00",
      timelineCurrentLabel: "Retained 00:12",
      timelineTrailingLabel: "Target 30:00",
    });
  });

  it("keeps unsupported channels honest as live-only playback", () => {
    const model = buildPlayerTimeshiftUiModel({
      diagnostics: {
        isPaused: false,
        isAtLiveEdge: true,
        liveLatencySeconds: 0,
        timeshiftSupported: false,
        timeshiftAvailable: false,
      },
      timeshiftStatus: null,
    });

    expect(model).toMatchObject({
      state: "LIVE_ONLY",
      showTimeline: false,
      capabilityLabel: "No DVR",
      liveStateLabel: "LIVE",
      viewerPositionLabel: "At live edge",
      bufferWindowLabel: "Live-only channel",
    });
  });
});
