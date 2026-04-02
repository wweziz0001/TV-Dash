import { describe, expect, it } from "vitest";
import {
  buildChannelFormFromConfig,
  buildChannelInput,
  createEmptyManualVariantFormValue,
  formatHeadersJson,
  parseHeadersJson,
} from "./channel-admin-form";

describe("channel admin form helpers", () => {
  it("builds a persisted master-playlist payload with upstream headers and EPG mapping", () => {
    expect(
      buildChannelInput({
        name: "News Desk",
        slug: "news-desk",
        logoUrl: "",
        groupId: "11111111-1111-1111-1111-111111111111",
        sourceMode: "MASTER_PLAYLIST",
        masterHlsUrl: "https://example.com/live.m3u8",
        manualVariants: [createEmptyManualVariantFormValue()],
        isActive: true,
        sortOrder: 2,
        playbackMode: "PROXY",
        upstreamUserAgent: "OpsBot/1.0",
        upstreamReferrer: "https://ops.example.com/",
        upstreamHeadersText: '{\n  "x-token": "abc"\n}',
        epgSourceId: "22222222-2222-2222-2222-222222222222",
        epgChannelId: "news-desk",
      }),
    ).toEqual({
      name: "News Desk",
      slug: "news-desk",
      logoUrl: "",
      groupId: "11111111-1111-1111-1111-111111111111",
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: "https://example.com/live.m3u8",
      isActive: true,
      sortOrder: 2,
      playbackMode: "PROXY",
      upstreamUserAgent: "OpsBot/1.0",
      upstreamReferrer: "https://ops.example.com/",
      upstreamHeaders: {
        "x-token": "abc",
      },
      epgSourceId: "22222222-2222-2222-2222-222222222222",
      epgChannelId: "news-desk",
    });
  });

  it("builds a manual-variant payload without leaking a master URL", () => {
    expect(
      buildChannelInput({
        name: "Al Alam",
        slug: "al-alam",
        logoUrl: "",
        groupId: "",
        sourceMode: "MANUAL_VARIANTS",
        masterHlsUrl: "",
        manualVariants: [
          {
            label: "low",
            sortOrder: 0,
            playlistUrl: "https://example.com/live/low/index.m3u8",
            width: "",
            height: "360",
            bandwidth: "",
            codecs: "",
            isActive: true,
          },
          {
            label: "high",
            sortOrder: 1,
            playlistUrl: "https://example.com/live/high/index.m3u8",
            width: "1920",
            height: "1080",
            bandwidth: "5000000",
            codecs: "avc1.640028,mp4a.40.2",
            isActive: true,
          },
        ],
        isActive: true,
        sortOrder: 3,
        playbackMode: "DIRECT",
        upstreamUserAgent: "",
        upstreamReferrer: "",
        upstreamHeadersText: "",
        epgSourceId: "",
        epgChannelId: "",
      }),
    ).toEqual({
      name: "Al Alam",
      slug: "al-alam",
      logoUrl: "",
      groupId: null,
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
      isActive: true,
      sortOrder: 3,
      playbackMode: "DIRECT",
      upstreamUserAgent: "",
      upstreamReferrer: "",
      upstreamHeaders: {},
      epgSourceId: null,
      epgChannelId: null,
    });
  });

  it("hydrates form state from the admin channel config response", () => {
    expect(
      buildChannelFormFromConfig({
        id: "33333333-3333-3333-3333-333333333333",
        name: "News Desk",
        slug: "news-desk",
        logoUrl: null,
        sourceMode: "MANUAL_VARIANTS",
        masterHlsUrl: null,
        playbackMode: "PROXY",
        manualVariantCount: 2,
        groupId: null,
        group: null,
        epgSourceId: "22222222-2222-2222-2222-222222222222",
        epgChannelId: "news-desk",
        epgSource: {
          id: "22222222-2222-2222-2222-222222222222",
          name: "Ops XMLTV",
          slug: "ops-xmltv",
          sourceType: "XMLTV",
          isActive: true,
        },
        upstreamUserAgent: "OpsBot/1.0",
        upstreamReferrer: "https://ops.example.com/",
        upstreamHeaders: {
          "x-token": "abc",
        },
        qualityVariants: [
          {
            id: "variant-1",
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
            id: "variant-2",
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
        isActive: true,
        sortOrder: 2,
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      }),
    ).toMatchObject({
      sourceMode: "MANUAL_VARIANTS",
      playbackMode: "PROXY",
      upstreamUserAgent: "OpsBot/1.0",
      upstreamReferrer: "https://ops.example.com/",
      epgSourceId: "22222222-2222-2222-2222-222222222222",
      epgChannelId: "news-desk",
      manualVariants: [
        {
          label: "low",
          height: "360",
        },
        {
          label: "high",
          bandwidth: "5000000",
          codecs: "avc1.640028,mp4a.40.2",
        },
      ],
    });

    expect(formatHeadersJson({ "x-token": "abc" })).toContain('"x-token": "abc"');
    expect(parseHeadersJson('{"x-token":"abc"}')).toEqual({ "x-token": "abc" });
  });
});
