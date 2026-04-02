import { normalizeUpstreamHeaders } from "../../app/upstream-request.js";
import type { ChannelConfigRecord, PublicChannelRecord } from "./channel.repository.js";

export function mapPublicChannel(record: PublicChannelRecord) {
  return {
    ...record,
    masterHlsUrl: record.playbackMode === "PROXY" ? null : record.masterHlsUrl,
    epgSourceId: record.epgSourceId ?? null,
    epgChannelId: record.epgChannelId ?? null,
    epgSource: record.epgSource ?? null,
  };
}

export function mapChannelConfig(record: ChannelConfigRecord) {
  return {
    ...mapPublicChannel(record),
    masterHlsUrl: record.masterHlsUrl,
    upstreamUserAgent: record.upstreamUserAgent ?? null,
    upstreamReferrer: record.upstreamReferrer ?? null,
    upstreamHeaders: normalizeUpstreamHeaders(record.upstreamHeaders),
  };
}
