import { normalizeUpstreamHeaders } from "../../app/upstream-request.js";
import type { StreamChannelRecord } from "../channels/channel.repository.js";

export interface RecordingInputConfig {
  sourceUrl: string;
  ffmpegInputArgs: string[];
  captureMode: "DIRECT" | "PROXY";
}

function buildInternalRecordingSourceUrl(channelId: string, apiPort: number) {
  return `http://127.0.0.1:${apiPort}/api/streams/channels/${channelId}/master`;
}

function buildInternalProxyInputConfig(channelId: string, apiPort: number): RecordingInputConfig {
  return {
    sourceUrl: buildInternalRecordingSourceUrl(channelId, apiPort),
    ffmpegInputArgs: [
      "-allowed_extensions",
      "ALL",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto,data",
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_on_network_error",
      "1",
      "-reconnect_delay_max",
      "2",
      "-fflags",
      "+genpts+discardcorrupt",
    ],
    captureMode: "PROXY",
  };
}

function buildFfmpegHeaderArgument(headers: Record<string, string>) {
  const lines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);

  return lines.length ? `${lines.join("\r\n")}\r\n` : null;
}

function buildDirectUpstreamInputConfig(channel: StreamChannelRecord): RecordingInputConfig {
  const ffmpegInputArgs: string[] = [];

  if (channel.upstreamUserAgent) {
    ffmpegInputArgs.push("-user_agent", channel.upstreamUserAgent);
  }

  if (channel.upstreamReferrer) {
    ffmpegInputArgs.push("-referer", channel.upstreamReferrer);
  }

  const normalizedHeaders = normalizeUpstreamHeaders(channel.upstreamHeaders);
  const headerArgument = buildFfmpegHeaderArgument(normalizedHeaders);

  if (headerArgument) {
    ffmpegInputArgs.push("-headers", headerArgument);
  }

  return {
    sourceUrl: channel.masterHlsUrl ?? "",
    ffmpegInputArgs,
    captureMode: "DIRECT",
  };
}

export function buildRecordingInputConfig(channel: StreamChannelRecord, apiPort: number): RecordingInputConfig {
  if (channel.sourceMode === "MANUAL_VARIANTS" || channel.playbackMode === "PROXY" || !channel.masterHlsUrl) {
    return buildInternalProxyInputConfig(channel.id, apiPort);
  }

  return buildDirectUpstreamInputConfig(channel);
}
