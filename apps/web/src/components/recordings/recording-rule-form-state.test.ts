import { describe, expect, it } from "vitest";
import {
  buildRecordingRuleForm,
  buildRecordingRuleProgramPrefill,
  createEmptyRecordingRuleForm,
  toggleRecordingRuleWeekday,
  validateRecordingRuleForm,
} from "./recording-rule-form-state";

describe("recording-rule-form-state", () => {
  it("builds a weekly prefill from a guide programme", () => {
    const form = buildRecordingRuleProgramPrefill({
      channelId: "11111111-1111-1111-1111-111111111111",
      programId: "22222222-2222-2222-2222-222222222222",
      programTitle: "Morning News",
      startAt: "2026-04-06T08:00:00.000Z",
      endAt: "2026-04-06T09:00:00.000Z",
      timeZone: "UTC",
    });

    expect(form.recurrenceType).toBe("WEEKLY");
    expect(form.durationMinutes).toBe(60);
    expect(form.originProgramEntryId).toBe("22222222-2222-2222-2222-222222222222");
    expect(form.matchProgramTitle).toBe("Morning News");
  });

  it("validates a weekday recurring rule payload", () => {
    const result = validateRecordingRuleForm(
      createEmptyRecordingRuleForm({
        channelId: "11111111-1111-1111-1111-111111111111",
        titleTemplate: "Weekday News",
        recurrenceType: "WEEKDAYS",
        weekdays: ["MONDAY", "WEDNESDAY", "FRIDAY"],
        startsAtLocal: "2026-04-06T08:00",
        durationMinutes: 45,
        requestedQualitySelector: "AUTO",
        timeZone: "UTC",
      }),
    );

    expect(result.isValid).toBe(true);
    expect(result.payload).toMatchObject({
      recurrenceType: "WEEKDAYS",
      weekdays: ["MONDAY", "WEDNESDAY", "FRIDAY"],
      durationMinutes: 45,
    });
  });

  it("requires at least one weekday for weekday recurrence", () => {
    const result = validateRecordingRuleForm(
      createEmptyRecordingRuleForm({
        channelId: "11111111-1111-1111-1111-111111111111",
        recurrenceType: "WEEKDAYS",
        startsAtLocal: "2026-04-06T08:00",
        durationMinutes: 45,
        timeZone: "UTC",
      }),
    );

    expect(result.isValid).toBe(false);
    expect(result.issues[0]?.message).toContain("weekday");
  });

  it("hydrates the form from an existing recurring rule", () => {
    const form = buildRecordingRuleForm({
      id: "rule-1",
      channelId: "11111111-1111-1111-1111-111111111111",
      titleTemplate: "Morning News",
      recurrenceType: "WEEKLY",
      weekdays: ["MONDAY"],
      startsAt: "2026-04-06T08:00:00.000Z",
      durationMinutes: 60,
      timeZone: "UTC",
      paddingBeforeMinutes: 2,
      paddingAfterMinutes: 5,
      requestedQualitySelector: "AUTO",
      requestedQualityLabel: "Source default",
      matchProgramTitle: "Morning News",
      isActive: true,
      createdAt: "2026-04-05T08:00:00.000Z",
      updatedAt: "2026-04-05T08:00:00.000Z",
      originProgram: null,
      channel: {
        id: "11111111-1111-1111-1111-111111111111",
        name: "TV Dash Live",
        slug: "tv-dash-live",
        isActive: true,
      },
      createdByUser: {
        id: "user-1",
        username: "ops",
        role: "ADMIN",
      },
      nextUpcomingJob: null,
      generatedJobCount: 2,
    });

    expect(form.recurrenceType).toBe("WEEKLY");
    expect(form.weekdays).toEqual(["MONDAY"]);
    expect(form.paddingAfterMinutes).toBe(5);
  });

  it("toggles weekday selection idempotently", () => {
    expect(toggleRecordingRuleWeekday(["MONDAY"], "WEDNESDAY")).toEqual(["MONDAY", "WEDNESDAY"]);
    expect(toggleRecordingRuleWeekday(["MONDAY", "WEDNESDAY"], "MONDAY")).toEqual(["WEDNESDAY"]);
  });
});
