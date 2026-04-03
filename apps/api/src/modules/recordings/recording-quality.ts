import { buildUpstreamHeaders } from "../../app/upstream-request.js";
import type { StreamChannelRecord } from "../channels/channel.repository.js";
import { parseMasterPlaylist } from "../streams/playlist-parser.js";

export interface RecordingQualityOption {
  value: string;
  label: string;
  height: number | null;
}

const RECORDING_DEFAULT_QUALITY_OPTION: RecordingQualityOption = {
  value: "AUTO",
  label: "Source default",
  height: null,
};

function mapChannelRequestConfig(channel: StreamChannelRecord) {
  return {
    requestUserAgent: channel.upstreamUserAgent,
    requestReferrer: channel.upstreamReferrer,
    requestHeaders: channel.upstreamHeaders as Record<string, string> | null,
  };
}

function sortQualityOptions(options: Array<RecordingQualityOption & { bandwidth?: number | null }>) {
  return [...options].sort((left, right) => {
    const heightDifference = (right.height ?? 0) - (left.height ?? 0);

    if (heightDifference !== 0) {
      return heightDifference;
    }

    return (right.bandwidth ?? 0) - (left.bandwidth ?? 0);
  });
}

async function fetchMasterPlaylist(channel: StreamChannelRecord) {
  if (!channel.masterHlsUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(channel.masterHlsUrl, {
      signal: controller.signal,
      headers: buildUpstreamHeaders(mapChannelRequestConfig(channel)),
    });

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function listRecordingQualityOptions(channel: StreamChannelRecord): Promise<RecordingQualityOption[]> {
  if (channel.sourceMode === "MANUAL_VARIANTS") {
    const variants = sortQualityOptions(
      channel.qualityVariants.map((variant, index) => ({
        value: String(index),
        label: variant.label,
        height: variant.height ?? null,
        bandwidth: variant.bandwidth ?? null,
      })),
    ).map(({ value, label, height }) => ({ value, label, height }));

    return [RECORDING_DEFAULT_QUALITY_OPTION, ...variants];
  }

  const playlist = await fetchMasterPlaylist(channel).catch(() => null);

  if (!playlist) {
    return [RECORDING_DEFAULT_QUALITY_OPTION];
  }

  const parsed = parseMasterPlaylist(playlist);

  if (!parsed.isMasterPlaylist || !parsed.variants.length) {
    return [RECORDING_DEFAULT_QUALITY_OPTION];
  }

  const variants = sortQualityOptions(
    parsed.variants.map((variant, index) => ({
      value: String(index),
      label: variant.label,
      height: variant.height,
      bandwidth: variant.bandwidth,
    })),
  ).map(({ value, label, height }) => ({ value, label, height }));

  return [RECORDING_DEFAULT_QUALITY_OPTION, ...variants];
}

export function resolveRecordingVideoStreamIndex(requestedQualitySelector: string | null | undefined) {
  if (!requestedQualitySelector || requestedQualitySelector === "AUTO") {
    return 0;
  }

  const parsed = Number.parseInt(requestedQualitySelector, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
