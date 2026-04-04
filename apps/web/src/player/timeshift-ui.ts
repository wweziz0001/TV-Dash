import type { LiveTimeshiftStatus } from "@/types/api";
import type { PlayerSeekState } from "./browser-media";
import type { PlayerDiagnostics } from "./playback-diagnostics";

const LIVE_EDGE_TOLERANCE_SECONDS = 2;
const NEAR_LIVE_THRESHOLD_SECONDS = 10;

export type PlayerTimeshiftPlaybackState =
  | "LIVE_ONLY"
  | "LIVE_EDGE"
  | "NEAR_LIVE"
  | "BEHIND_LIVE"
  | "PAUSED"
  | "WARMING"
  | "ERROR";

interface BuildPlayerTimeshiftUiModelOptions {
  timeshiftStatus?: LiveTimeshiftStatus | null;
  diagnostics: Pick<
    PlayerDiagnostics,
    "isPaused" | "isAtLiveEdge" | "liveLatencySeconds" | "timeshiftSupported" | "timeshiftAvailable"
  >;
  seekState?: Pick<PlayerSeekState, "canSeek" | "rangeStart" | "rangeEnd" | "liveWindowSeconds"> | null;
  currentTime?: number | null;
}

export interface PlayerTimeshiftUiModel {
  state: PlayerTimeshiftPlaybackState;
  showTimeline: boolean;
  timelineInteractive: boolean;
  capabilityLabel: string;
  liveStateLabel: string;
  liveStateTone: "success" | "warning" | "neutral" | "danger";
  viewerPositionLabel: string;
  stateDescription: string;
  bufferWindowLabel: string;
  offsetSeconds: number;
  offsetLabel: string | null;
  configuredWindowSeconds: number;
  availableWindowSeconds: number;
  timelineBufferedRatio: number;
  timelinePlayheadRatio: number | null;
  timelineLeadingLabel: string;
  timelineCurrentLabel: string;
  timelineTrailingLabel: string;
  goLiveLabel: string;
  goLiveRecommended: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getRoundedSeconds(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function formatPlayerDuration(seconds: number | null | undefined) {
  const totalSeconds = getRoundedSeconds(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatOffsetLabel(seconds: number) {
  if (seconds <= 0) {
    return null;
  }

  return `-${formatPlayerDuration(seconds)}`;
}

function getPlaybackState(
  timeshiftStatus: LiveTimeshiftStatus | null,
  diagnostics: BuildPlayerTimeshiftUiModelOptions["diagnostics"],
  offsetSeconds: number,
) {
  if (!diagnostics.timeshiftSupported || !timeshiftStatus?.supported) {
    return "LIVE_ONLY" as const;
  }

  if (!diagnostics.timeshiftAvailable || !timeshiftStatus.available) {
    return timeshiftStatus.bufferState === "ERROR" ? ("ERROR" as const) : ("WARMING" as const);
  }

  if (diagnostics.isPaused) {
    return "PAUSED" as const;
  }

  if (diagnostics.isAtLiveEdge || offsetSeconds <= LIVE_EDGE_TOLERANCE_SECONDS) {
    return "LIVE_EDGE" as const;
  }

  if (offsetSeconds <= NEAR_LIVE_THRESHOLD_SECONDS) {
    return "NEAR_LIVE" as const;
  }

  return "BEHIND_LIVE" as const;
}

export function buildPlayerTimeshiftUiModel({
  timeshiftStatus = null,
  diagnostics,
  seekState = null,
  currentTime = null,
}: BuildPlayerTimeshiftUiModelOptions): PlayerTimeshiftUiModel {
  const configuredWindowSeconds = getRoundedSeconds(
    timeshiftStatus?.windowSeconds ?? seekState?.liveWindowSeconds ?? 0,
  );
  const seekWindowSeconds = getRoundedSeconds(seekState?.liveWindowSeconds ?? 0);
  const statusAvailableWindowSeconds = getRoundedSeconds(timeshiftStatus?.availableWindowSeconds ?? 0);
  const availableWindowSeconds =
    diagnostics.timeshiftAvailable && seekWindowSeconds > 0 ? seekWindowSeconds : statusAvailableWindowSeconds;
  const offsetSeconds =
    diagnostics.timeshiftAvailable && !diagnostics.isAtLiveEdge
      ? getRoundedSeconds(diagnostics.liveLatencySeconds)
      : 0;
  const state = getPlaybackState(timeshiftStatus, diagnostics, offsetSeconds);
  const timelineInteractive =
    diagnostics.timeshiftAvailable &&
    Boolean(seekState?.canSeek) &&
    seekState?.rangeStart !== null &&
    seekState?.rangeEnd !== null;
  const showTimeline = diagnostics.timeshiftSupported || Boolean(timeshiftStatus?.supported);
  const timelineBufferedRatio =
    timelineInteractive || configuredWindowSeconds <= 0
      ? 1
      : clamp(availableWindowSeconds / configuredWindowSeconds, 0, 1);
  const timelineRangeStart = seekState?.rangeStart ?? null;
  const timelineRangeEnd = seekState?.rangeEnd ?? null;
  const timelinePlayheadRatio =
    timelineInteractive &&
    timelineRangeStart !== null &&
    timelineRangeEnd !== null &&
    currentTime !== null
      ? clamp(
          (currentTime - timelineRangeStart) / Math.max(timelineRangeEnd - timelineRangeStart, 1),
          0,
          1,
        )
      : null;
  const offsetLabel = formatOffsetLabel(offsetSeconds);

  switch (state) {
    case "LIVE_ONLY":
      return {
        state,
        showTimeline: false,
        timelineInteractive: false,
        capabilityLabel: "No DVR",
        liveStateLabel: "LIVE",
        liveStateTone: "neutral",
        viewerPositionLabel: "At live edge",
        stateDescription: "This channel is live only. TV-Dash is not retaining a rewind buffer.",
        bufferWindowLabel: "Live-only channel",
        offsetSeconds: 0,
        offsetLabel: null,
        configuredWindowSeconds: 0,
        availableWindowSeconds: 0,
        timelineBufferedRatio: 0,
        timelinePlayheadRatio: null,
        timelineLeadingLabel: "",
        timelineCurrentLabel: "",
        timelineTrailingLabel: "",
        goLiveLabel: "Live",
        goLiveRecommended: false,
      };

    case "ERROR":
      return {
        state,
        showTimeline,
        timelineInteractive: false,
        capabilityLabel: "DVR issue",
        liveStateLabel: "BUFFER ISSUE",
        liveStateTone: "danger",
        viewerPositionLabel: "Buffer unavailable",
        stateDescription:
          timeshiftStatus?.message ?? "The retained DVR buffer is unavailable right now.",
        bufferWindowLabel:
          configuredWindowSeconds > 0
            ? `Retained ${formatPlayerDuration(availableWindowSeconds)} of ${formatPlayerDuration(configuredWindowSeconds)}`
            : "Retained buffer unavailable",
        offsetSeconds: 0,
        offsetLabel: null,
        configuredWindowSeconds,
        availableWindowSeconds,
        timelineBufferedRatio,
        timelinePlayheadRatio: null,
        timelineLeadingLabel: "00:00",
        timelineCurrentLabel: `Retained ${formatPlayerDuration(availableWindowSeconds)}`,
        timelineTrailingLabel:
          configuredWindowSeconds > 0 ? `Target ${formatPlayerDuration(configuredWindowSeconds)}` : "Target",
        goLiveLabel: "Live",
        goLiveRecommended: false,
      };

    case "WARMING":
      return {
        state,
        showTimeline,
        timelineInteractive: false,
        capabilityLabel: "DVR warming",
        liveStateLabel: "WARMING",
        liveStateTone: "warning",
        viewerPositionLabel: "Buffer warming",
        stateDescription:
          timeshiftStatus?.message ?? "TV-Dash is still retaining enough media for DVR controls.",
        bufferWindowLabel:
          configuredWindowSeconds > 0
            ? `Retained ${formatPlayerDuration(availableWindowSeconds)} of ${formatPlayerDuration(configuredWindowSeconds)}`
            : `Retained ${formatPlayerDuration(availableWindowSeconds)}`,
        offsetSeconds: 0,
        offsetLabel: null,
        configuredWindowSeconds,
        availableWindowSeconds,
        timelineBufferedRatio,
        timelinePlayheadRatio: null,
        timelineLeadingLabel: "00:00",
        timelineCurrentLabel: `Retained ${formatPlayerDuration(availableWindowSeconds)}`,
        timelineTrailingLabel:
          configuredWindowSeconds > 0 ? `Target ${formatPlayerDuration(configuredWindowSeconds)}` : "Target",
        goLiveLabel: "Live",
        goLiveRecommended: false,
      };

    case "PAUSED":
      return {
        state,
        showTimeline,
        timelineInteractive,
        capabilityLabel: "DVR ready",
        liveStateLabel: "PAUSED",
        liveStateTone: "neutral",
        viewerPositionLabel: `${formatPlayerDuration(offsetSeconds)} behind live`,
        stateDescription: `Paused ${formatPlayerDuration(offsetSeconds)} behind live inside the retained DVR window.`,
        bufferWindowLabel:
          configuredWindowSeconds > 0 && availableWindowSeconds !== configuredWindowSeconds
            ? `Retained ${formatPlayerDuration(availableWindowSeconds)} of ${formatPlayerDuration(configuredWindowSeconds)}`
            : `Retained ${formatPlayerDuration(availableWindowSeconds)}`,
        offsetSeconds,
        offsetLabel,
        configuredWindowSeconds,
        availableWindowSeconds,
        timelineBufferedRatio,
        timelinePlayheadRatio,
        timelineLeadingLabel: `-${formatPlayerDuration(availableWindowSeconds)}`,
        timelineCurrentLabel: offsetLabel ? `Paused ${offsetLabel}` : "Paused at live edge",
        timelineTrailingLabel: "LIVE EDGE",
        goLiveLabel: "Go Live",
        goLiveRecommended: true,
      };

    case "LIVE_EDGE":
      return {
        state,
        showTimeline,
        timelineInteractive,
        capabilityLabel: "DVR ready",
        liveStateLabel: "LIVE",
        liveStateTone: "success",
        viewerPositionLabel: "At live edge",
        stateDescription: "Playback is at the live edge.",
        bufferWindowLabel:
          configuredWindowSeconds > 0 && availableWindowSeconds !== configuredWindowSeconds
            ? `Retained ${formatPlayerDuration(availableWindowSeconds)} of ${formatPlayerDuration(configuredWindowSeconds)}`
            : `Retained ${formatPlayerDuration(availableWindowSeconds)}`,
        offsetSeconds: 0,
        offsetLabel: null,
        configuredWindowSeconds,
        availableWindowSeconds,
        timelineBufferedRatio,
        timelinePlayheadRatio,
        timelineLeadingLabel: `-${formatPlayerDuration(availableWindowSeconds)}`,
        timelineCurrentLabel: "Playhead LIVE",
        timelineTrailingLabel: "LIVE EDGE",
        goLiveLabel: "Live",
        goLiveRecommended: false,
      };

    case "NEAR_LIVE":
      return {
        state,
        showTimeline,
        timelineInteractive,
        capabilityLabel: "DVR ready",
        liveStateLabel: "NEAR LIVE",
        liveStateTone: "warning",
        viewerPositionLabel: `${formatPlayerDuration(offsetSeconds)} behind live`,
        stateDescription: `${formatPlayerDuration(offsetSeconds)} behind live. Go Live returns to the edge immediately.`,
        bufferWindowLabel:
          configuredWindowSeconds > 0 && availableWindowSeconds !== configuredWindowSeconds
            ? `Retained ${formatPlayerDuration(availableWindowSeconds)} of ${formatPlayerDuration(configuredWindowSeconds)}`
            : `Retained ${formatPlayerDuration(availableWindowSeconds)}`,
        offsetSeconds,
        offsetLabel,
        configuredWindowSeconds,
        availableWindowSeconds,
        timelineBufferedRatio,
        timelinePlayheadRatio,
        timelineLeadingLabel: `-${formatPlayerDuration(availableWindowSeconds)}`,
        timelineCurrentLabel: offsetLabel ? `Playhead ${offsetLabel}` : "Playhead LIVE",
        timelineTrailingLabel: "LIVE EDGE",
        goLiveLabel: "Go Live",
        goLiveRecommended: true,
      };

    case "BEHIND_LIVE":
    default:
      return {
        state: "BEHIND_LIVE",
        showTimeline,
        timelineInteractive,
        capabilityLabel: "DVR ready",
        liveStateLabel: offsetLabel ?? "BEHIND LIVE",
        liveStateTone: "warning",
        viewerPositionLabel: `${formatPlayerDuration(offsetSeconds)} behind live`,
        stateDescription: `${formatPlayerDuration(offsetSeconds)} behind live inside the retained DVR window.`,
        bufferWindowLabel:
          configuredWindowSeconds > 0 && availableWindowSeconds !== configuredWindowSeconds
            ? `Retained ${formatPlayerDuration(availableWindowSeconds)} of ${formatPlayerDuration(configuredWindowSeconds)}`
            : `Retained ${formatPlayerDuration(availableWindowSeconds)}`,
        offsetSeconds,
        offsetLabel,
        configuredWindowSeconds,
        availableWindowSeconds,
        timelineBufferedRatio,
        timelinePlayheadRatio,
        timelineLeadingLabel: `-${formatPlayerDuration(availableWindowSeconds)}`,
        timelineCurrentLabel: offsetLabel ? `Playhead ${offsetLabel}` : "Playhead",
        timelineTrailingLabel: "LIVE EDGE",
        goLiveLabel: "Go Live",
        goLiveRecommended: true,
      };
  }
}
