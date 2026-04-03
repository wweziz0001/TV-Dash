import { afterEach, describe, expect, it } from "vitest";
import { listStructuredLogs, resetStructuredLogBuffer, writeStructuredLog } from "./structured-log.js";

describe("structured-log", () => {
  afterEach(() => {
    resetStructuredLogBuffer();
  });

  it("retains logs in recent-first order and filters by level and category", () => {
    writeStructuredLog("info", {
      event: "auth.login.succeeded",
      actorUserId: "user-1",
    });
    writeStructuredLog("warn", {
      event: "stream.proxy.master.failed",
      channelId: "channel-1",
      detail: {
        targetUrl: "https://example.com/live.m3u8",
      },
    });
    writeStructuredLog("error", {
      event: "epg.parse.failed",
      epgSourceId: "epg-1",
    });

    expect(listStructuredLogs().map((entry) => entry.event)).toEqual([
      "epg.parse.failed",
      "stream.proxy.master.failed",
      "auth.login.succeeded",
    ]);
    expect(listStructuredLogs({ level: "warn" }).map((entry) => entry.event)).toEqual([
      "stream.proxy.master.failed",
    ]);
    expect(listStructuredLogs({ category: "epg" }).map((entry) => entry.event)).toEqual(["epg.parse.failed"]);
  });

  it("supports free-text filtering across event metadata and detail payloads", () => {
    writeStructuredLog("warn", {
      event: "playback.session.failed",
      actorUserId: "11111111-1111-1111-1111-111111111111",
      channelSlug: "world-feed",
      sessionId: "22222222-2222-2222-2222-222222222222",
      detail: {
        quality: "AUTO",
        sessionType: "MULTIVIEW",
      },
    });

    expect(listStructuredLogs({ search: "world-feed" })).toHaveLength(1);
    expect(listStructuredLogs({ search: "multiview" })).toHaveLength(1);
    expect(listStructuredLogs({ search: "missing-value" })).toHaveLength(0);
  });
});
