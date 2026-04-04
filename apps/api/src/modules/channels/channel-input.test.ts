import { describe, expect, it } from "vitest";
import { channelInputSchema } from "@tv-dash/shared";

describe("channelInputSchema", () => {
  it("accepts a valid master-playlist payload", () => {
    expect(() =>
      channelInputSchema.parse({
        name: "Pulse 24",
        slug: "pulse-24",
        logoUrl: "",
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: "https://example.com/live/master.m3u8",
        groupId: null,
        isActive: true,
        sortOrder: 1,
        playbackMode: "DIRECT",
        timeshiftEnabled: false,
        timeshiftWindowMinutes: null,
        upstreamUserAgent: "",
        upstreamReferrer: "",
        upstreamHeaders: {},
        epgSourceId: null,
        epgChannelId: null,
      }),
    ).not.toThrow();
  });

  it("accepts a valid manual-variant payload", () => {
    expect(() =>
      channelInputSchema.parse({
        name: "Al Alam",
        slug: "al-alam",
        logoUrl: "",
        sourceMode: "MANUAL_VARIANTS",
        masterHlsUrl: null,
        manualVariants: [
          {
            label: "low",
            sortOrder: 0,
            playlistUrl: "https://example.com/live/low/index.m3u8",
            width: null,
            height: 360,
            bandwidth: null,
            codecs: null,
            isActive: true,
          },
          {
            label: "high",
            sortOrder: 1,
            playlistUrl: "https://example.com/live/high/index.m3u8",
            width: 1920,
            height: 1080,
            bandwidth: 5000000,
            codecs: "avc1.640028,mp4a.40.2",
            isActive: true,
          },
        ],
        groupId: null,
        isActive: true,
        sortOrder: 2,
        playbackMode: "PROXY",
        timeshiftEnabled: true,
        timeshiftWindowMinutes: 30,
        upstreamUserAgent: "",
        upstreamReferrer: "",
        upstreamHeaders: {},
        epgSourceId: null,
        epgChannelId: null,
      }),
    ).not.toThrow();
  });

  it("accepts shared delivery when TV-Dash owns the local serving path", () => {
    expect(() =>
      channelInputSchema.parse({
        name: "Shared News",
        slug: "shared-news",
        logoUrl: "",
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: "https://example.com/live/master.m3u8",
        groupId: null,
        isActive: true,
        sortOrder: 3,
        playbackMode: "SHARED",
        timeshiftEnabled: true,
        timeshiftWindowMinutes: 30,
        upstreamUserAgent: "",
        upstreamReferrer: "",
        upstreamHeaders: {},
        epgSourceId: null,
        epgChannelId: null,
      }),
    ).not.toThrow();
  });

  it("rejects mixed-mode payloads", () => {
    const mixedModeResult = channelInputSchema.safeParse({
      name: "Broken",
      slug: "broken",
      logoUrl: "",
      sourceMode: "MANUAL_VARIANTS",
      masterHlsUrl: "https://example.com/live/master.m3u8",
      manualVariants: [
        {
          label: "high",
          sortOrder: 0,
          playlistUrl: "https://example.com/live/high/index.m3u8",
          width: null,
          height: 720,
          bandwidth: null,
          codecs: null,
          isActive: true,
        },
      ],
      groupId: null,
      isActive: true,
      sortOrder: 0,
      playbackMode: "DIRECT",
      timeshiftEnabled: false,
      timeshiftWindowMinutes: null,
      upstreamUserAgent: "",
      upstreamReferrer: "",
      upstreamHeaders: {},
      epgSourceId: null,
      epgChannelId: null,
    });

    const duplicateVariantResult = channelInputSchema.safeParse({
      name: "Broken",
      slug: "broken",
      logoUrl: "",
      sourceMode: "MANUAL_VARIANTS",
      masterHlsUrl: null,
      manualVariants: [
        {
          label: "high",
          sortOrder: 0,
          playlistUrl: "https://example.com/live/high/index.m3u8",
          width: null,
          height: 720,
          bandwidth: null,
          codecs: null,
          isActive: true,
        },
        {
          label: "high",
          sortOrder: 0,
          playlistUrl: "https://example.com/live/high/index.m3u8",
          width: null,
          height: 1080,
          bandwidth: null,
          codecs: null,
          isActive: true,
        },
      ],
      groupId: null,
      isActive: true,
      sortOrder: 0,
      playbackMode: "DIRECT",
      timeshiftEnabled: false,
      timeshiftWindowMinutes: null,
      upstreamUserAgent: "",
      upstreamReferrer: "",
      upstreamHeaders: {},
      epgSourceId: null,
      epgChannelId: null,
    });

    expect(mixedModeResult.success).toBe(false);
    expect(mixedModeResult.error?.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["masterHlsUrl"]));

    expect(duplicateVariantResult.success).toBe(false);
    expect(duplicateVariantResult.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["manualVariants.1.label", "manualVariants.1.sortOrder", "manualVariants.1.playlistUrl"]),
    );
  });

  it("rejects timeshift on direct playback because TV-Dash cannot retain the live buffer", () => {
    const result = channelInputSchema.safeParse({
      name: "Direct DVR",
      slug: "direct-dvr",
      logoUrl: "",
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://example.com/live/master.m3u8",
      groupId: null,
      isActive: true,
      sortOrder: 0,
      playbackMode: "DIRECT",
      timeshiftEnabled: true,
      timeshiftWindowMinutes: 30,
      upstreamUserAgent: "",
      upstreamReferrer: "",
      upstreamHeaders: {},
      epgSourceId: null,
      epgChannelId: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("playbackMode");
  });
});
