import { describe, expect, it } from "vitest";
import { formatProgrammeTimeWithDay, getChannelGuideState, getProgrammeProgressPercent } from "./channel-guide-state";

function buildProgram(start: string, stop: string, title = "Morning News") {
  return {
    id: `${title}-${start}`,
    sourceKind: "IMPORTED" as const,
    title,
    subtitle: null,
    description: null,
    category: null,
    imageUrl: null,
    start,
    stop,
  };
}

describe("getProgrammeProgressPercent", () => {
  it("clamps programme progress between zero and one hundred", () => {
    expect(
      getProgrammeProgressPercent(
        buildProgram("2026-04-02T09:00:00.000Z", "2026-04-02T10:00:00.000Z"),
        new Date("2026-04-02T09:30:00.000Z"),
      ),
    ).toBe(50);

    expect(
      getProgrammeProgressPercent(
        buildProgram("2026-04-02T09:00:00.000Z", "2026-04-02T10:00:00.000Z"),
        new Date("2026-04-02T11:00:00.000Z"),
      ),
    ).toBe(100);
  });
});

describe("formatProgrammeTimeWithDay", () => {
  it("labels next programmes happening today or tomorrow", () => {
    expect(
      formatProgrammeTimeWithDay(
        buildProgram("2026-04-02T20:30:00.000Z", "2026-04-02T21:30:00.000Z"),
        new Date("2026-04-02T09:30:00.000Z"),
      ),
    ).toMatch(/^Today · /);

    expect(
      formatProgrammeTimeWithDay(
        buildProgram("2026-04-03T20:30:00.000Z", "2026-04-03T21:30:00.000Z"),
        new Date("2026-04-02T09:30:00.000Z"),
      ),
    ).toMatch(/^Tomorrow · /);
  });

  it("falls back to a short date for programmes beyond tomorrow", () => {
    expect(
      formatProgrammeTimeWithDay(
        buildProgram("2026-04-05T20:30:00.000Z", "2026-04-05T21:30:00.000Z"),
        new Date("2026-04-02T09:30:00.000Z"),
      ),
    ).toContain("·");
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
          now: { ...buildProgram("2026-04-02T09:00:00.000Z", "2026-04-02T10:00:00.000Z"), subtitle: "Top stories" },
          next: buildProgram("2026-04-02T10:00:00.000Z", "2026-04-02T10:30:00.000Z", "Weather"),
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
          status: "SOURCE_INACTIVE",
          now: null,
          next: null,
        },
      }).kind,
    ).toBe("source-inactive");

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
