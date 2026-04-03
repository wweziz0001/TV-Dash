import { afterEach, describe, expect, it } from "vitest";
import {
  buildChannelDiagnosticsSnapshot,
  buildEpgSourceDiagnosticsSnapshot,
  recordChannelGuideStatus,
  recordChannelObservation,
  recordEpgCacheState,
  recordEpgObservation,
  resetRuntimeDiagnostics,
} from "./diagnostic.service.js";

describe("diagnostic.service", () => {
  afterEach(() => {
    resetRuntimeDiagnostics();
  });

  it("returns unknown channel health when no runtime observations exist", () => {
    const snapshot = buildChannelDiagnosticsSnapshot({
      id: "channel-1",
      slug: "channel-1",
      playbackMode: "PROXY",
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://example.com/live.m3u8",
      qualityVariants: [],
      epgSourceId: null,
      epgChannelId: null,
    });

    expect(snapshot.healthState).toBe("unknown");
    expect(snapshot.reachable).toBeNull();
    expect(snapshot.guide.status).toBe("unconfigured");
  });

  it("marks a channel degraded after a fresh failure following a success", () => {
    recordChannelObservation("channel-2", "proxyMaster", {
      status: "success",
      source: "PROXY_MASTER",
      observedAt: new Date("2026-04-03T01:00:00.000Z"),
      detail: { contentType: "application/vnd.apple.mpegurl" },
    });
    recordChannelObservation("channel-2", "proxyMaster", {
      status: "failure",
      source: "PROXY_MASTER",
      observedAt: new Date("2026-04-03T01:05:00.000Z"),
      reason: "Upstream returned 503",
      failureKind: "playlist-fetch",
      retryable: true,
      detail: { statusCode: 503 },
    });
    recordChannelGuideStatus({
      channelId: "channel-2",
      status: "ready",
      sourceId: "epg-1",
      epgChannelId: "news-desk",
      observedAt: new Date("2026-04-03T01:06:00.000Z"),
    });

    const snapshot = buildChannelDiagnosticsSnapshot({
      id: "channel-2",
      slug: "channel-2",
      playbackMode: "PROXY",
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://example.com/live.m3u8",
      qualityVariants: [],
      epgSourceId: "epg-1",
      epgChannelId: "news-desk",
    });

    expect(snapshot.healthState).toBe("degraded");
    expect(snapshot.reachable).toBe(false);
    expect(snapshot.proxyMaster.lastFailureKind).toBe("playlist-fetch");
    expect(snapshot.guide.status).toBe("ready");
  });

  it("marks a channel failing after repeated consecutive failures", () => {
    recordChannelObservation("channel-3", "syntheticMaster", {
      status: "failure",
      source: "SYNTHETIC_MASTER",
      observedAt: new Date("2026-04-03T02:00:00.000Z"),
      reason: "Synthetic master playlist could not be generated because no active variants are available",
      failureKind: "synthetic-master",
      retryable: false,
    });
    recordChannelObservation("channel-3", "syntheticMaster", {
      status: "failure",
      source: "SYNTHETIC_MASTER",
      observedAt: new Date("2026-04-03T02:05:00.000Z"),
      reason: "Synthetic master playlist could not be generated because no active variants are available",
      failureKind: "synthetic-master",
      retryable: false,
    });

    const snapshot = buildChannelDiagnosticsSnapshot({
      id: "channel-3",
      slug: "channel-3",
      playbackMode: "PROXY",
      sourceMode: "MANUAL_VARIANTS",
      masterHlsUrl: null,
      qualityVariants: [{ id: "variant-1" }],
      epgSourceId: null,
      epgChannelId: null,
    });

    expect(snapshot.healthState).toBe("failing");
    expect(snapshot.syntheticMaster.consecutiveFailures).toBe(2);
  });

  it("builds epg diagnostics snapshots from fetch, parse, and cache observations", () => {
    recordEpgObservation("epg-1", "fetch", {
      status: "success",
      source: "XMLTV_LOAD",
      observedAt: new Date("2026-04-03T03:00:00.000Z"),
      detail: { sourceUrl: "https://example.com/guide.xml" },
    });
    recordEpgObservation("epg-1", "parse", {
      status: "success",
      source: "XMLTV_LOAD",
      observedAt: new Date("2026-04-03T03:00:01.000Z"),
      detail: { channelCount: 42, programmeCount: 640 },
    });
    recordEpgCacheState({
      sourceId: "epg-1",
      loadedAt: new Date("2026-04-03T03:00:01.000Z"),
      expiresAt: new Date("2026-04-03T09:00:01.000Z"),
      channelCount: 42,
      programmeCount: 640,
    });

    const snapshot = buildEpgSourceDiagnosticsSnapshot({
      id: "epg-1",
      slug: "ops-xmltv",
    });

    expect(snapshot.healthState).toBe("healthy");
    expect(snapshot.cache.channelCount).toBe(42);
    expect(snapshot.parse.detail).toEqual({
      channelCount: 42,
      programmeCount: 640,
    });
  });
});
