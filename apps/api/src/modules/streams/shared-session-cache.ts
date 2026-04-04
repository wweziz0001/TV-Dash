import { env } from "../../config/env.js";

export type SharedCacheKind = "manifest" | "segment";

export interface SharedSessionCachePayload {
  body: Buffer | string;
  contentType: string;
  cacheKind: SharedCacheKind;
}

export interface SharedSessionCacheEntry extends SharedSessionCachePayload {
  cachedAtMs: number;
  expiresAtMs: number;
  sizeBytes: number;
}

export interface SharedSessionCacheSnapshot {
  bytesUsed: number;
  entryCount: number;
  manifestEntryCount: number;
  segmentEntryCount: number;
  manifestHitCount: number;
  manifestMissCount: number;
  segmentHitCount: number;
  segmentMissCount: number;
  inflightReuseCount: number;
  upstreamRequestCount: number;
  evictedEntryCount: number;
}

function getBodySizeBytes(body: Buffer | string) {
  return typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
}

export function createSharedSessionCache() {
  const entries = new Map<string, SharedSessionCacheEntry>();
  const inflightLoads = new Map<string, Promise<SharedSessionCachePayload>>();
  let bytesUsed = 0;
  let manifestHitCount = 0;
  let manifestMissCount = 0;
  let segmentHitCount = 0;
  let segmentMissCount = 0;
  let inflightReuseCount = 0;
  let upstreamRequestCount = 0;
  let evictedEntryCount = 0;

  function evictEntry(cacheKey: string) {
    const entry = entries.get(cacheKey);
    if (!entry) {
      return;
    }

    bytesUsed = Math.max(0, bytesUsed - entry.sizeBytes);
    entries.delete(cacheKey);
    evictedEntryCount += 1;
  }

  function evictExpiredEntries(nowMs = Date.now()) {
    entries.forEach((entry, cacheKey) => {
      if (entry.expiresAtMs <= nowMs) {
        evictEntry(cacheKey);
      }
    });
  }

  function enforceCapacityLimits() {
    while (entries.size > env.SHARED_STREAM_MAX_CACHE_ENTRIES || bytesUsed > env.SHARED_STREAM_MAX_CACHE_BYTES) {
      const oldestKey = entries.keys().next().value;

      if (!oldestKey) {
        break;
      }

      evictEntry(oldestKey);
    }
  }

  function trackCacheLookup(cacheKind: SharedCacheKind, hit: boolean) {
    if (cacheKind === "manifest") {
      if (hit) {
        manifestHitCount += 1;
      } else {
        manifestMissCount += 1;
      }

      return;
    }

    if (hit) {
      segmentHitCount += 1;
    } else {
      segmentMissCount += 1;
    }
  }

  function get(cacheKey: string, cacheKind: SharedCacheKind, nowMs = Date.now()) {
    evictExpiredEntries(nowMs);

    const entry = entries.get(cacheKey);
    if (!entry) {
      trackCacheLookup(cacheKind, false);
      return null;
    }

    if (entry.expiresAtMs <= nowMs) {
      evictEntry(cacheKey);
      trackCacheLookup(cacheKind, false);
      return null;
    }

    entries.delete(cacheKey);
    entries.set(cacheKey, entry);
    trackCacheLookup(cacheKind, true);
    return entry;
  }

  function set(cacheKey: string, payload: SharedSessionCachePayload, nowMs = Date.now()) {
    const ttlMs = payload.cacheKind === "manifest" ? env.SHARED_STREAM_MANIFEST_TTL_MS : env.SHARED_STREAM_SEGMENT_TTL_MS;
    const nextEntry: SharedSessionCacheEntry = {
      ...payload,
      cachedAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
      sizeBytes: getBodySizeBytes(payload.body),
    };

    if (entries.has(cacheKey)) {
      evictEntry(cacheKey);
    }

    entries.set(cacheKey, nextEntry);
    bytesUsed += nextEntry.sizeBytes;
    evictExpiredEntries(nowMs);
    enforceCapacityLimits();
    return nextEntry;
  }

  async function load(cacheKey: string, loader: () => Promise<SharedSessionCachePayload>) {
    const inflight = inflightLoads.get(cacheKey);
    if (inflight) {
      inflightReuseCount += 1;
      return inflight;
    }

    upstreamRequestCount += 1;
    const nextLoad = loader().finally(() => {
      inflightLoads.delete(cacheKey);
    });
    inflightLoads.set(cacheKey, nextLoad);
    return nextLoad;
  }

  function clear() {
    entries.clear();
    inflightLoads.clear();
    bytesUsed = 0;
  }

  function getSnapshot(): SharedSessionCacheSnapshot {
    let manifestEntryCount = 0;
    let segmentEntryCount = 0;

    entries.forEach((entry) => {
      if (entry.cacheKind === "manifest") {
        manifestEntryCount += 1;
      } else {
        segmentEntryCount += 1;
      }
    });

    return {
      bytesUsed,
      entryCount: entries.size,
      manifestEntryCount,
      segmentEntryCount,
      manifestHitCount,
      manifestMissCount,
      segmentHitCount,
      segmentMissCount,
      inflightReuseCount,
      upstreamRequestCount,
      evictedEntryCount,
    };
  }

  return {
    clear,
    get,
    getSnapshot,
    load,
    set,
  };
}
