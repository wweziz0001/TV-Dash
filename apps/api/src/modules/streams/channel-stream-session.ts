import { isSharedPlaybackMode, isTvDashManagedPlaybackMode, type ChannelSourceMode, type StreamPlaybackMode } from "@tv-dash/shared";
import { env } from "../../config/env.js";
import { getChannelStreamDetails } from "../channels/channel.service.js";
import { getChannelSharedStreamStatus, type SharedStreamStatus } from "./shared-stream-session.js";
import { getChannelTimeshiftStatus, type TimeshiftStatus } from "./timeshift-buffer.js";

export type ChannelStreamSessionMode = "DIRECT" | "PROXY_RELAY" | "PROXY_DVR" | "SHARED_RELAY" | "SHARED_DVR";
export type ChannelViewerDefaultPlayback = "LIVE_EDGE" | "BUFFERED";

export interface ChannelStreamSessionStatus {
  channelId: string;
  channelSlug: string;
  playbackMode: StreamPlaybackMode;
  sourceMode: ChannelSourceMode;
  sessionMode: ChannelStreamSessionMode;
  livePlaybackUrl: string | null;
  bufferedPlaybackUrl: string | null;
  defaultPlaybackUrl: string | null;
  viewerModel: {
    liveEdgeAvailable: boolean;
    bufferedPlaybackSupported: boolean;
    bufferedPlaybackAvailable: boolean;
    defaultPlayback: ChannelViewerDefaultPlayback;
    returnToLiveSupported: boolean;
  };
  sharedSession: SharedStreamStatus | null;
  timeshift: TimeshiftStatus;
  message: string;
}

function buildLivePlaybackUrl(
  channel: NonNullable<Awaited<ReturnType<typeof getChannelStreamDetails>>>,
): string | null {
  if (isSharedPlaybackMode(channel.playbackMode)) {
    return `/api/streams/channels/${channel.id}/shared/master`;
  }

  if (channel.playbackMode === "PROXY" || channel.sourceMode === "MANUAL_VARIANTS") {
    return `/api/streams/channels/${channel.id}/master`;
  }

  return channel.masterHlsUrl;
}

function buildBufferedPlaybackUrl(
  channel: NonNullable<Awaited<ReturnType<typeof getChannelStreamDetails>>>,
  timeshift: TimeshiftStatus,
): string | null {
  if (!channel.timeshiftEnabled || !isTvDashManagedPlaybackMode(channel.playbackMode) || !timeshift.supported) {
    return null;
  }

  return `/api/streams/channels/${channel.id}/timeshift/master`;
}

function getSessionMode(
  playbackMode: StreamPlaybackMode,
  timeshiftConfigured: boolean,
): ChannelStreamSessionMode {
  if (playbackMode === "DIRECT") {
    return "DIRECT";
  }

  if (playbackMode === "SHARED") {
    return timeshiftConfigured ? "SHARED_DVR" : "SHARED_RELAY";
  }

  return timeshiftConfigured ? "PROXY_DVR" : "PROXY_RELAY";
}

function buildSessionMessage(params: {
  sessionMode: ChannelStreamSessionMode;
  sharedSession: SharedStreamStatus | null;
  timeshift: TimeshiftStatus;
}) {
  const { sessionMode, sharedSession, timeshift } = params;

  switch (sessionMode) {
    case "DIRECT":
      return "Playback stays on the upstream path. TV-Dash does not own a shared relay session for this channel.";
    case "PROXY_RELAY":
      return "TV-Dash is acting as a live relay only. There is no retained DVR window for this channel.";
    case "PROXY_DVR":
      return timeshift.available
        ? "TV-Dash is serving a retained live DVR window on top of proxy-managed delivery."
        : `TV-Dash is warming a retained live DVR window. ${timeshift.message}`;
    case "SHARED_RELAY":
      return sharedSession?.active
        ? "The shared local channel session is active and serving live-edge relay/cache delivery."
        : "The shared local channel session will start on the first live-edge viewer request.";
    case "SHARED_DVR":
      return timeshift.available
        ? "The shared local channel session is backing both live-edge relay delivery and the retained DVR window."
        : `The shared local channel session is active, and the retained DVR window is still warming. ${timeshift.message}`;
  }
}

export async function getChannelStreamSessionStatus(channelId: string): Promise<ChannelStreamSessionStatus> {
  const channel = await getChannelStreamDetails(channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  const timeshiftStatus = await getChannelTimeshiftStatus(channelId);
  const sharedSessionStatus = isSharedPlaybackMode(channel.playbackMode)
    ? await getChannelSharedStreamStatus(channelId)
    : null;

  const livePlaybackUrl = buildLivePlaybackUrl(channel);
  const bufferedPlaybackUrl = buildBufferedPlaybackUrl(channel, timeshiftStatus);
  const defaultPlaybackUrl =
    bufferedPlaybackUrl && timeshiftStatus.available ? bufferedPlaybackUrl : livePlaybackUrl;
  const sessionMode = getSessionMode(channel.playbackMode, timeshiftStatus.configured);

  return {
    channelId: channel.id,
    channelSlug: channel.slug,
    playbackMode: channel.playbackMode,
    sourceMode: channel.sourceMode,
    sessionMode,
    livePlaybackUrl,
    bufferedPlaybackUrl,
    defaultPlaybackUrl,
    viewerModel: {
      liveEdgeAvailable:
        Boolean(livePlaybackUrl) &&
        (channel.playbackMode !== "SHARED" || (env.SHARED_STREAM_ENABLED && sharedSessionStatus?.enabled !== false)),
      bufferedPlaybackSupported: timeshiftStatus.supported,
      bufferedPlaybackAvailable: timeshiftStatus.available,
      defaultPlayback: bufferedPlaybackUrl && timeshiftStatus.available ? "BUFFERED" : "LIVE_EDGE",
      returnToLiveSupported: timeshiftStatus.supported,
    },
    sharedSession: sharedSessionStatus,
    timeshift: timeshiftStatus,
    message: buildSessionMessage({
      sessionMode,
      sharedSession: sharedSessionStatus,
      timeshift: timeshiftStatus,
    }),
  };
}
