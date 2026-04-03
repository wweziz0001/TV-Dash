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

function parseTagAttributes(line: string) {
  const attributeString = line.slice(line.indexOf(":") + 1);
  const attributes = new Map<string, string>();

  for (const part of attributeString.split(",")) {
    const [key, value] = part.split("=");
    if (key && value) {
      attributes.set(key.trim(), value.replaceAll('"', "").trim());
    }
  }

  return attributes;
}

function rewriteMediaTagUri(line: string, baseUrl: string) {
  return line.replace(/URI="([^"]+)"/, (_, uri: string) => {
    try {
      return `URI="${new URL(uri, baseUrl).toString()}"`;
    } catch {
      return `URI="${uri}"`;
    }
  });
}

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

function resolveVariantIndex(requestedQualitySelector: string | null | undefined, variantCount: number) {
  if (!requestedQualitySelector || requestedQualitySelector === "AUTO") {
    return 0;
  }

  const parsed = Number.parseInt(requestedQualitySelector, 10);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= variantCount) {
    return 0;
  }

  return parsed;
}

function buildSingleVariantMasterPlaylist(masterPlaylist: string, masterUrl: string, requestedVariantIndex: number) {
  const parsed = parseMasterPlaylist(masterPlaylist);

  if (!parsed.variantEntries.length) {
    return null;
  }

  const selectedVariant = parsed.variantEntries[resolveVariantIndex(String(requestedVariantIndex), parsed.variantEntries.length)];

  if (!selectedVariant) {
    return null;
  }

  const lines = masterPlaylist.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const globalLines = lines.filter(
    (line) =>
      line === "#EXTM3U" ||
      (line.startsWith("#") && !line.startsWith("#EXT-X-STREAM-INF") && !line.startsWith("#EXT-X-MEDIA")),
  );
  const audioGroupLines = selectedVariant.audioGroupId
    ? lines
        .filter((line) => line.startsWith("#EXT-X-MEDIA"))
        .filter((line) => parseTagAttributes(line).get("TYPE") === "AUDIO")
        .filter((line) => parseTagAttributes(line).get("GROUP-ID") === selectedVariant.audioGroupId)
        .map((line) => rewriteMediaTagUri(line, masterUrl))
    : [];
  const absoluteVariantUrl = new URL(selectedVariant.uri, masterUrl).toString();

  return {
    playlistText: [...globalLines, ...audioGroupLines, selectedVariant.streamInfLine, absoluteVariantUrl].join("\n"),
    selectedVariantLabel: selectedVariant.label,
  };
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

  if (!parsed.isMasterPlaylist || !parsed.variantEntries.length) {
    return [RECORDING_DEFAULT_QUALITY_OPTION];
  }

  const variants = sortQualityOptions(
    parsed.variantEntries.map((variant) => ({
      value: String(variant.index),
      label: variant.label,
      height: variant.height,
      bandwidth: variant.bandwidth,
    })),
  ).map(({ value, label, height }) => ({ value, label, height }));

  return [RECORDING_DEFAULT_QUALITY_OPTION, ...variants];
}

export async function resolveRecordingSourceDescriptor(
  channel: StreamChannelRecord,
  requestedQualitySelector: string | null | undefined,
) {
  if (channel.sourceMode === "MANUAL_VARIANTS") {
    const selectedIndex = resolveVariantIndex(requestedQualitySelector, channel.qualityVariants.length);
    const selectedVariant = channel.qualityVariants[selectedIndex] ?? channel.qualityVariants[0];

    return {
      sourceUrl: selectedVariant?.playlistUrl ?? null,
      singleVariantMasterPlaylist: null,
      selectedQualityLabel: selectedVariant?.label ?? null,
    };
  }

  if (!channel.masterHlsUrl) {
    return {
      sourceUrl: null,
      singleVariantMasterPlaylist: null,
      selectedQualityLabel: null,
    };
  }

  const playlist = await fetchMasterPlaylist(channel).catch(() => null);

  if (!playlist) {
    return {
      sourceUrl: channel.masterHlsUrl,
      singleVariantMasterPlaylist: null,
      selectedQualityLabel: null,
    };
  }

  const parsed = parseMasterPlaylist(playlist);

  if (!parsed.isMasterPlaylist || !parsed.variantEntries.length) {
    return {
      sourceUrl: channel.masterHlsUrl,
      singleVariantMasterPlaylist: null,
      selectedQualityLabel: null,
    };
  }

  const selectedVariantIndex = resolveVariantIndex(requestedQualitySelector, parsed.variantEntries.length);
  const singleVariantMaster = buildSingleVariantMasterPlaylist(playlist, channel.masterHlsUrl, selectedVariantIndex);

  return {
    sourceUrl: singleVariantMaster ? null : new URL(parsed.variantEntries[selectedVariantIndex]?.uri ?? "", channel.masterHlsUrl).toString(),
    singleVariantMasterPlaylist: singleVariantMaster?.playlistText ?? null,
    selectedQualityLabel: singleVariantMaster?.selectedVariantLabel ?? parsed.variantEntries[selectedVariantIndex]?.label ?? null,
  };
}
