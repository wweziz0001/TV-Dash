import { describe, expect, it } from "vitest";
import { buildChannelArchiveView } from "./channel-archive-state";
import type { NowNextProgram } from "@/types/api";

function buildProgramme(
  id: string,
  start: string,
  archiveStatus: NonNullable<NowNextProgram["catchup"]>["archiveStatus"],
  overrides: Partial<NowNextProgram> = {},
): NowNextProgram {
  return {
    id,
    sourceKind: "IMPORTED",
    title: `Programme ${id}`,
    subtitle: null,
    description: null,
    category: "News",
    imageUrl: null,
    start,
    stop: new Date(Date.parse(start) + 60 * 60_000).toISOString(),
    catchup: {
      timingState: "PREVIOUS",
      playbackState:
        archiveStatus === "AIRED_ARCHIVED"
          ? "PREVIOUS_RECORDING_AND_TIMESHIFT"
          : archiveStatus === "AIRED_RECORDED"
            ? "PREVIOUS_RECORDING"
            : archiveStatus === "AIRED_CATCHUP"
              ? "PREVIOUS_TIMESHIFT"
              : "PREVIOUS_NOT_AVAILABLE",
      archiveStatus,
      archiveAccess:
        archiveStatus === "AIRED_ARCHIVED"
          ? "RECORDING_AND_TIMESHIFT"
          : archiveStatus === "AIRED_RECORDED"
            ? "RECORDING"
            : archiveStatus === "AIRED_CATCHUP"
              ? "TIMESHIFT"
              : "NONE",
      hasRecordingSource: archiveStatus === "AIRED_ARCHIVED" || archiveStatus === "AIRED_RECORDED",
      hasTimeshiftSource: archiveStatus === "AIRED_ARCHIVED" || archiveStatus === "AIRED_CATCHUP",
      isCatchupPlayable: archiveStatus !== "AIRED_UNAVAILABLE",
      watchFromStartAvailable: false,
      preferredSourceType:
        archiveStatus === "AIRED_ARCHIVED" || archiveStatus === "AIRED_RECORDED"
          ? "RECORDING"
          : archiveStatus === "AIRED_CATCHUP"
            ? "TIMESHIFT"
            : null,
      availableUntilAt: "2026-04-05T10:00:00.000Z",
      sources: [],
    },
    ...overrides,
  };
}

describe("channel-archive-state", () => {
  it("groups earlier programmes by day and summarizes archive availability", () => {
    const view = buildChannelArchiveView({
      programmes: [
        buildProgramme("1", "2026-04-05T08:00:00.000Z", "AIRED_ARCHIVED"),
        buildProgramme("2", "2026-04-05T06:00:00.000Z", "AIRED_CATCHUP"),
        buildProgramme("3", "2026-04-04T12:00:00.000Z", "AIRED_UNAVAILABLE"),
      ],
      search: "",
      availabilityFilter: "ALL",
      selectedDate: null,
      now: new Date("2026-04-05T10:00:00.000Z"),
    });

    expect(view.summary).toEqual({
      total: 3,
      playable: 2,
      recorded: 1,
      catchup: 2,
      unavailable: 1,
    });
    expect(view.sections).toHaveLength(2);
    expect(view.sections[0]?.programmes).toHaveLength(2);
    expect(view.availableDates).toHaveLength(2);
  });

  it("filters archive results by selected day, search text, and archive availability", () => {
    const view = buildChannelArchiveView({
      programmes: [
        buildProgramme("1", "2026-04-05T08:00:00.000Z", "AIRED_ARCHIVED", {
          title: "Morning Headlines",
        }),
        buildProgramme("2", "2026-04-05T06:00:00.000Z", "AIRED_CATCHUP", {
          title: "Overnight Replay",
        }),
        buildProgramme("3", "2026-04-04T12:00:00.000Z", "AIRED_RECORDED", {
          title: "Late Movie",
        }),
      ],
      search: "headline",
      availabilityFilter: "RECORDED",
      selectedDate: "2026-04-05",
      now: new Date("2026-04-05T10:00:00.000Z"),
    });

    expect(view.programmes.map((programme) => programme.id)).toEqual(["1"]);
    expect(view.summary.recorded).toBe(1);
    expect(view.sections[0]?.date).toBe("2026-04-05");
  });
});
