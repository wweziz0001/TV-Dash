import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeUpstreamHeaders } from "../../app/upstream-request.js";
import { env } from "../../config/env.js";
import type { StreamChannelRecord } from "../channels/channel.repository.js";
import type { RecordingFfmpegCapabilities } from "./recording-ffmpeg-capabilities.js";
import { resolveRecordingSourceDescriptor } from "./recording-quality.js";

export interface RecordingInputConfig {
  sourceUrl: string;
  ffmpegInputArgs: string[];
  captureMode: "DIRECT" | "PROXY";
  temporaryFilePath: string | null;
}

function buildFfmpegHeaderArgument(headers: Record<string, string>) {
  const lines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);

  return lines.length ? `${lines.join("\r\n")}\r\n` : null;
}

function buildReconnectInputArgs(sourceUrl: string) {
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return [];
  }

  return ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_on_network_error", "1", "-reconnect_delay_max", "2"];
}

function buildInternalRecordingSourceUrl(channelId: string, apiPort: number) {
  return `http://127.0.0.1:${apiPort}/api/streams/channels/${channelId}/master?intent=recording`;
}

function buildProxyHlsInputArgs(
  ffmpegCapabilities?: Pick<RecordingFfmpegCapabilities, "supportsAllowedSegmentExtensions" | "supportsExtensionPicky"> | null,
) {
  const ffmpegInputArgs = ["-allowed_extensions", "ALL"];

  if (ffmpegCapabilities?.supportsAllowedSegmentExtensions) {
    ffmpegInputArgs.push("-allowed_segment_extensions", "ALL");
  }

  if (ffmpegCapabilities?.supportsExtensionPicky) {
    ffmpegInputArgs.push("-extension_picky", "0");
  }

  ffmpegInputArgs.push(
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
  );

  return ffmpegInputArgs;
}

function buildInternalProxyInputConfig(
  channelId: string,
  apiPort: number,
  ffmpegCapabilities?: Pick<
    RecordingFfmpegCapabilities,
    "supportsAllowedSegmentExtensions" | "supportsExtensionPicky"
  > | null,
): RecordingInputConfig {
  return {
    sourceUrl: buildInternalRecordingSourceUrl(channelId, apiPort),
    ffmpegInputArgs: buildProxyHlsInputArgs(ffmpegCapabilities),
    captureMode: "PROXY",
    temporaryFilePath: null,
  };
}

function buildBaseInputArgs(channel: StreamChannelRecord) {
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
    ffmpegInputArgs: [
      "-allowed_extensions",
      "ALL",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto,data",
      ...ffmpegInputArgs,
    ],
  };
}

async function writeRecordingPlaylistFile(channelId: string, playlistText: string) {
  const playlistDirectory = path.resolve(env.RECORDINGS_STORAGE_DIR, ".tmp");
  await fs.mkdir(playlistDirectory, { recursive: true });
  const playlistPath = path.join(playlistDirectory, `${channelId}-${randomUUID()}.m3u8`);
  await fs.writeFile(playlistPath, playlistText, "utf8");
  return playlistPath;
}

export async function buildRecordingInputConfig(
  channel: StreamChannelRecord,
  apiPort: number,
  requestedQualitySelector: string | null | undefined,
  ffmpegCapabilities?: Pick<
    RecordingFfmpegCapabilities,
    "supportsAllowedSegmentExtensions" | "supportsExtensionPicky"
  > | null,
): Promise<RecordingInputConfig> {
  if (channel.playbackMode === "PROXY") {
    return buildInternalProxyInputConfig(channel.id, apiPort, ffmpegCapabilities);
  }

  const inputArgs = buildBaseInputArgs(channel);
  const resolvedSource = await resolveRecordingSourceDescriptor(channel, requestedQualitySelector);

  if (resolvedSource.singleVariantMasterPlaylist) {
    const temporaryFilePath = await writeRecordingPlaylistFile(channel.id, resolvedSource.singleVariantMasterPlaylist);

    return {
      sourceUrl: temporaryFilePath,
      ffmpegInputArgs: inputArgs.ffmpegInputArgs,
      captureMode: "DIRECT",
      temporaryFilePath,
    };
  }

  const sourceUrl = resolvedSource.sourceUrl ?? channel.masterHlsUrl ?? channel.qualityVariants[0]?.playlistUrl ?? "";

  return {
    sourceUrl,
    ffmpegInputArgs: [...inputArgs.ffmpegInputArgs, ...buildReconnectInputArgs(sourceUrl)],
    captureMode: "DIRECT",
    temporaryFilePath: null,
  };
}
