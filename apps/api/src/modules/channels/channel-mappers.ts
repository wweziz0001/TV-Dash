import { normalizeUpstreamHeaders } from "../../app/upstream-request.js";
import type { ChannelConfigRecord, PublicChannelRecord } from "./channel.repository.js";

export function mapPublicChannel(record: PublicChannelRecord) {
  const { qualityVariants, ...channel } = record;
  const activeVariants = Array.isArray(qualityVariants) ? qualityVariants : [];

  return {
    ...channel,
    masterHlsUrl: channel.playbackMode === "PROXY" ? null : channel.masterHlsUrl,
    manualVariantCount: activeVariants.length,
    epgSourceId: channel.epgSourceId ?? null,
    epgChannelId: channel.epgChannelId ?? null,
    epgSource: channel.epgSource ?? null,
  };
}

export function mapChannelConfig(record: ChannelConfigRecord) {
  return {
    ...mapPublicChannel(record),
    masterHlsUrl: record.masterHlsUrl,
    upstreamUserAgent: record.upstreamUserAgent ?? null,
    upstreamReferrer: record.upstreamReferrer ?? null,
    upstreamHeaders: normalizeUpstreamHeaders(record.upstreamHeaders),
    qualityVariants: record.qualityVariants.map((variant) => ({
      ...variant,
      width: variant.width ?? null,
      height: variant.height ?? null,
      bandwidth: variant.bandwidth ?? null,
      codecs: variant.codecs ?? null,
    })),
  };
}
