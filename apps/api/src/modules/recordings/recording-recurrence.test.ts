import { describe, expect, it } from "vitest";
import {
  buildRecordingRuleOccurrence,
  describeRecordingRuleStart,
  getWeekdayForDate,
  listRecordingRuleOccurrences,
} from "./recording-recurrence.js";

describe("recording-recurrence", () => {
  const baseRule = {
    recurrenceType: "DAILY" as const,
    weekdays: [],
    startsAt: new Date("2026-04-06T13:00:00.000Z"),
    durationMinutes: 60,
    timeZone: "UTC",
    paddingBeforeMinutes: 5,
    paddingAfterMinutes: 10,
  };

  it("lists daily occurrences inside the requested window with padding applied", () => {
    const occurrences = listRecordingRuleOccurrences(baseRule, {
      rangeStart: new Date("2026-04-07T00:00:00.000Z"),
      rangeEnd: new Date("2026-04-09T00:00:00.000Z"),
    });

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]).toMatchObject({
      scheduledStartAt: new Date("2026-04-07T13:00:00.000Z"),
      scheduledEndAt: new Date("2026-04-07T14:00:00.000Z"),
      startAt: new Date("2026-04-07T12:55:00.000Z"),
      endAt: new Date("2026-04-07T14:10:00.000Z"),
    });
  });

  it("limits weekly rules to the selected weekday", () => {
    const occurrences = listRecordingRuleOccurrences(
      {
        ...baseRule,
        recurrenceType: "WEEKLY",
        weekdays: ["MONDAY"],
      },
      {
        rangeStart: new Date("2026-04-06T00:00:00.000Z"),
        rangeEnd: new Date("2026-04-21T00:00:00.000Z"),
      },
    );

    expect(occurrences.map((occurrence) => occurrence.scheduledStartAt.toISOString())).toEqual([
      "2026-04-06T13:00:00.000Z",
      "2026-04-13T13:00:00.000Z",
      "2026-04-20T13:00:00.000Z",
    ]);
  });

  it("supports selected weekday rules across multiple days", () => {
    const occurrences = listRecordingRuleOccurrences(
      {
        ...baseRule,
        recurrenceType: "WEEKDAYS",
        weekdays: ["MONDAY", "WEDNESDAY", "FRIDAY"],
      },
      {
        rangeStart: new Date("2026-04-06T00:00:00.000Z"),
        rangeEnd: new Date("2026-04-13T00:00:00.000Z"),
      },
    );

    expect(occurrences.map((occurrence) => occurrence.weekday)).toEqual(["MONDAY", "WEDNESDAY", "FRIDAY"]);
  });

  it("keeps local wall time stable in the configured timezone", () => {
    const occurrences = listRecordingRuleOccurrences(
      {
        ...baseRule,
        startsAt: new Date("2026-04-06T13:00:00.000Z"),
        timeZone: "America/New_York",
      },
      {
        rangeStart: new Date("2026-04-06T00:00:00.000Z"),
        rangeEnd: new Date("2026-04-08T00:00:00.000Z"),
      },
    );

    expect(getWeekdayForDate(occurrences[0].scheduledStartAt, "America/New_York")).toBe("MONDAY");
    expect(describeRecordingRuleStart({
      ...baseRule,
      timeZone: "America/New_York",
    })).toBe("09:00");
  });

  it("can build a single occurrence from a local date seed", () => {
    const occurrence = buildRecordingRuleOccurrence(baseRule, {
      year: 2026,
      month: 4,
      day: 8,
    });

    expect(occurrence.scheduledStartAt.toISOString()).toBe("2026-04-08T13:00:00.000Z");
    expect(occurrence.endAt.toISOString()).toBe("2026-04-08T14:10:00.000Z");
  });
});
