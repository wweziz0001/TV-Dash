import { describe, expect, it } from "vitest";
import { buildChannelFormFromConfig, buildChannelInput, formatHeadersJson, parseHeadersJson } from "./channel-admin-form";

describe("channel admin form helpers", () => {
  it("builds a persisted channel payload with upstream headers and EPG mapping", () => {
    expect(
      buildChannelInput({
        name: "News Desk",
        slug: "news-desk",
        logoUrl: "",
        groupId: "11111111-1111-1111-1111-111111111111",
        masterHlsUrl: "https://example.com/live.m3u8",
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

  it("hydrates form state from the admin channel config response", () => {
    expect(
      buildChannelFormFromConfig({
        id: "33333333-3333-3333-3333-333333333333",
        name: "News Desk",
        slug: "news-desk",
        logoUrl: null,
        masterHlsUrl: "https://example.com/live.m3u8",
        playbackMode: "PROXY",
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
        isActive: true,
        sortOrder: 2,
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      }),
    ).toMatchObject({
      playbackMode: "PROXY",
      upstreamUserAgent: "OpsBot/1.0",
      upstreamReferrer: "https://ops.example.com/",
      epgSourceId: "22222222-2222-2222-2222-222222222222",
      epgChannelId: "news-desk",
    });

    expect(formatHeadersJson({ "x-token": "abc" })).toContain('"x-token": "abc"');
    expect(parseHeadersJson('{"x-token":"abc"}')).toEqual({ "x-token": "abc" });
  });
});
