import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeUpstreamHeaders } from "../../app/upstream-request.js";
import { env } from "../../config/env.js";
import type { StreamChannelRecord } from "../channels/channel.repository.js";
import { resolveRecordingSourceDescriptor } from "./recording-quality.js";

export interface RecordingInputConfig {
  sourceUrl: string;
  ffmpegInputArgs: string[];
  temporaryFilePath: string | null;
}

function buildFfmpegHeaderArgument(headers: Record<string, string>) {
  const lines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);

  return lines.length ? `${lines.join("\r\n")}\r\n` : null;
}

function buildDirectUpstreamInputArgs(channel: StreamChannelRecord) {
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
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_on_network_error",
      "1",
      "-reconnect_delay_max",
      "2",
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
  _apiPort: number,
  requestedQualitySelector: string | null | undefined,
): Promise<RecordingInputConfig> {
  const inputArgs = buildDirectUpstreamInputArgs(channel);
  const resolvedSource = await resolveRecordingSourceDescriptor(channel, requestedQualitySelector);

  if (resolvedSource.singleVariantMasterPlaylist) {
    const temporaryFilePath = await writeRecordingPlaylistFile(channel.id, resolvedSource.singleVariantMasterPlaylist);

    return {
      sourceUrl: temporaryFilePath,
      ffmpegInputArgs: inputArgs.ffmpegInputArgs,
      temporaryFilePath,
    };
  }

  return {
    sourceUrl: resolvedSource.sourceUrl ?? channel.masterHlsUrl ?? channel.qualityVariants[0]?.playlistUrl ?? "",
    ffmpegInputArgs: inputArgs.ffmpegInputArgs,
    temporaryFilePath: null,
  };
}
