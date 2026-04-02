import { describe, expect, it, vi } from "vitest";
import { createProxyToken, readProxyToken } from "./proxy-token.js";

describe("proxy tokens", () => {
  it("round-trips a valid token for the expected channel", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T00:00:00.000Z"));

    const token = createProxyToken({
      channelId: "11111111-1111-1111-1111-111111111111",
      target: "https://origin.example.com/live/master.m3u8",
    });

    expect(readProxyToken(token, "11111111-1111-1111-1111-111111111111")).toMatchObject({
      channelId: "11111111-1111-1111-1111-111111111111",
      target: "https://origin.example.com/live/master.m3u8",
    });

    vi.useRealTimers();
  });

  it("rejects expired or mismatched-channel tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T00:00:00.000Z"));

    const token = createProxyToken(
      {
        channelId: "11111111-1111-1111-1111-111111111111",
        target: "https://origin.example.com/live/master.m3u8",
      },
      { ttlMs: 1_000 },
    );

    vi.advanceTimersByTime(1_001);

    expect(readProxyToken(token, "11111111-1111-1111-1111-111111111111")).toBeNull();
    expect(readProxyToken(token, "22222222-2222-2222-2222-222222222222")).toBeNull();

    vi.useRealTimers();
  });
});
