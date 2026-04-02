import { describe, expect, it } from "vitest";
import { getChannelGuideState, getProgrammeProgressPercent } from "./channel-guide-state";

describe("getProgrammeProgressPercent", () => {
  it("clamps programme progress between zero and one hundred", () => {
    expect(
      getProgrammeProgressPercent(
        {
          title: "Morning News",
          subtitle: null,
          description: null,
          start: "2026-04-02T09:00:00.000Z",
          stop: "2026-04-02T10:00:00.000Z",
        },
        new Date("2026-04-02T09:30:00.000Z"),
      ),
    ).toBe(50);

    expect(
      getProgrammeProgressPercent(
        {
          title: "Morning News",
          subtitle: null,
          description: null,
          start: "2026-04-02T09:00:00.000Z",
          stop: "2026-04-02T10:00:00.000Z",
        },
        new Date("2026-04-02T11:00:00.000Z"),
      ),
    ).toBe(100);
  });
});

describe("getChannelGuideState", () => {
  it("returns a ready state when now/next data is available", () => {
    expect(
      getChannelGuideState({
        hasEpgSource: true,
        guide: {
          channelId: "channel-1",
          status: "READY",
          now: {
            title: "Morning News",
            subtitle: "Top stories",
            description: null,
            start: "2026-04-02T09:00:00.000Z",
            stop: "2026-04-02T10:00:00.000Z",
          },
          next: {
            title: "Weather",
            subtitle: null,
            description: null,
            start: "2026-04-02T10:00:00.000Z",
            stop: "2026-04-02T10:30:00.000Z",
          },
        },
        now: new Date("2026-04-02T09:30:00.000Z"),
      }),
    ).toMatchObject({
      kind: "ready",
      message: "Morning News",
      progressPercent: 50,
    });
  });

  it("keeps guide UX intentional when data is loading, missing, or unavailable", () => {
    expect(
      getChannelGuideState({
        hasEpgSource: true,
        guide: undefined,
        isLoading: true,
      }).kind,
    ).toBe("loading");

    expect(
      getChannelGuideState({
        hasEpgSource: false,
        guide: null,
      }).kind,
    ).toBe("unconfigured");

    expect(
      getChannelGuideState({
        hasEpgSource: true,
        guide: {
          channelId: "channel-1",
          status: "SOURCE_ERROR",
          now: null,
          next: null,
        },
      }).kind,
    ).toBe("source-error");

    expect(
      getChannelGuideState({
        hasEpgSource: true,
        guide: {
          channelId: "channel-1",
          status: "NO_DATA",
          now: null,
          next: null,
        },
      }).kind,
    ).toBe("no-data");
  });
});
