import { normalizeUpstreamHeaders } from "../../app/upstream-request.js";
import type { ChannelConfigRecord, PublicChannelRecord } from "./channel.repository.js";

export function mapPublicChannel(record: PublicChannelRecord) {
  const { qualityVariants, epgMapping, manualPrograms, ...channel } = record;
  const activeVariants = Array.isArray(qualityVariants) ? qualityVariants : [];
  const manualProgramItems = Array.isArray(manualPrograms) ? manualPrograms : [];
  const sourceChannel = epgMapping?.sourceChannel ?? null;
  const source = sourceChannel?.source ?? null;

  return {
    ...channel,
    masterHlsUrl: channel.playbackMode === "PROXY" ? null : channel.masterHlsUrl,
    timeshiftWindowMinutes: channel.timeshiftEnabled ? channel.timeshiftWindowMinutes ?? null : null,
    manualVariantCount: activeVariants.length,
    hasManualPrograms: manualProgramItems.length > 0,
    epgSourceId: source?.id ?? null,
    epgSourceChannelId: sourceChannel?.id ?? null,
    epgChannelId: sourceChannel?.externalId ?? null,
    epgSource: source,
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
