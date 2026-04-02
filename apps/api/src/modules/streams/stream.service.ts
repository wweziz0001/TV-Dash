import { buildUpstreamHeaders, type UpstreamRequestConfig } from "../../app/upstream-request.js";
import { getChannelStreamDetails } from "../channels/channel.service.js";
import { parseMasterPlaylist } from "./playlist-parser.js";
import { rewritePlaylist, isPlaylistResponse } from "./playlist-rewrite.js";
import { createProxyToken, readProxyToken } from "./proxy-token.js";

function buildProxyAssetPath(channelId: string, target: string) {
  const token = createProxyToken({ channelId, target });
  return `/api/streams/channels/${channelId}/asset?token=${encodeURIComponent(token)}`;
}

async function fetchUpstream(url: string, requestConfig: UpstreamRequestConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: buildUpstreamHeaders(requestConfig),
    });

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function mapChannelRequestConfig(channel: NonNullable<Awaited<ReturnType<typeof getChannelStreamDetails>>>) {
  return {
    requestUserAgent: channel.upstreamUserAgent,
    requestReferrer: channel.upstreamReferrer,
    requestHeaders: channel.upstreamHeaders as Record<string, string> | null,
  } satisfies UpstreamRequestConfig;
}

async function proxyStreamUrl(channelId: string, targetUrl: string) {
  const channel = await getChannelStreamDetails(channelId);

  if (!channel) {
    throw new Error("Channel not found");
  }

  const response = await fetchUpstream(targetUrl, mapChannelRequestConfig(channel));
  const contentType = response.headers.get("content-type");

  if (isPlaylistResponse(contentType, targetUrl)) {
    const playlist = await response.text();
    const rewrittenPlaylist = rewritePlaylist(playlist, targetUrl, (absoluteUrl) =>
      buildProxyAssetPath(channel.id, absoluteUrl),
    );

    return {
      body: rewrittenPlaylist,
      contentType: contentType ?? "application/vnd.apple.mpegurl",
    };
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: contentType ?? "application/octet-stream",
  };
}

export async function inspectStream(url: string, requestConfig: UpstreamRequestConfig = {}) {
  const response = await fetchUpstream(url, requestConfig);
  const text = await response.text();
  const parsed = parseMasterPlaylist(text);

  return {
    ok: true,
    contentType: response.headers.get("content-type"),
    variantCount: parsed.variantCount,
    variants: parsed.variants,
    isMasterPlaylist: parsed.isMasterPlaylist,
  };
}

export async function getChannelProxyMasterResponse(channelId: string) {
  const channel = await getChannelStreamDetails(channelId);

  if (!channel) {
    return null;
  }

  return proxyStreamUrl(channelId, channel.masterHlsUrl);
}

export async function getChannelProxyAssetResponse(channelId: string, token: string) {
  const payload = readProxyToken(token, channelId);

  if (!payload) {
    throw new Error("Invalid or expired proxy token");
  }

  return proxyStreamUrl(channelId, payload.target);
}
