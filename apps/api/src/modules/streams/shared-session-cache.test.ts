import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import { createSharedSessionCache } from "./shared-session-cache.js";

describe("shared-session-cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks manifest and segment hits, misses, and inflight reuse", async () => {
    const cache = createSharedSessionCache();

    expect(cache.get("manifest-1", "manifest")).toBeNull();

    cache.set("manifest-1", {
      body: "#EXTM3U\n",
      contentType: "application/vnd.apple.mpegurl",
      cacheKind: "manifest",
    });

    expect(cache.get("manifest-1", "manifest")?.body).toBe("#EXTM3U\n");

    const loader = vi.fn().mockImplementation(
      async () =>
        ({
          body: Buffer.from("segment-bytes"),
          contentType: "video/mp2t",
          cacheKind: "segment",
        }) as const,
    );

    const [left, right] = await Promise.all([cache.load("segment-1", loader), cache.load("segment-1", loader)]);
    expect(left.body).toEqual(Buffer.from("segment-bytes"));
    expect(right.body).toEqual(Buffer.from("segment-bytes"));
    expect(loader).toHaveBeenCalledTimes(1);

    cache.set("segment-1", left);
    expect(cache.get("segment-1", "segment")?.body).toEqual(Buffer.from("segment-bytes"));

    expect(cache.getSnapshot()).toMatchObject({
      manifestHitCount: 1,
      manifestMissCount: 1,
      segmentHitCount: 1,
      segmentMissCount: 0,
      inflightReuseCount: 1,
      upstreamRequestCount: 1,
      entryCount: 2,
    });
  });

  it("expires stale entries and evicts the oldest entries once the cache reaches capacity", () => {
    const cache = createSharedSessionCache();

    cache.set("manifest-expiring", {
      body: "#EXTM3U\n",
      contentType: "application/vnd.apple.mpegurl",
      cacheKind: "manifest",
    });

    vi.advanceTimersByTime(env.SHARED_STREAM_MANIFEST_TTL_MS + 1);
    expect(cache.get("manifest-expiring", "manifest")).toBeNull();

    for (let index = 0; index <= env.SHARED_STREAM_MAX_CACHE_ENTRIES; index += 1) {
      cache.set(`segment-${index}`, {
        body: Buffer.from(String(index)),
        contentType: "video/mp2t",
        cacheKind: "segment",
      });
    }

    expect(cache.getSnapshot().entryCount).toBeLessThanOrEqual(env.SHARED_STREAM_MAX_CACHE_ENTRIES);
    expect(cache.get("segment-0", "segment")).toBeNull();
    expect(cache.getSnapshot().evictedEntryCount).toBeGreaterThan(0);
  });
});
