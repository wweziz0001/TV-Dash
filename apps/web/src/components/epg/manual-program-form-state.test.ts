import { describe, expect, it } from "vitest";
import type { ProgramEntry } from "@/types/api";
import {
  buildManualProgramForm,
  createEmptyManualProgramForm,
  getManualProgramStatus,
  validateManualProgramForm,
} from "./manual-program-form-state";

function formatLocal(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildProgram(overrides: Partial<ProgramEntry> = {}): ProgramEntry {
  return {
    id: "manual-1",
    sourceKind: "MANUAL",
    channelId: "11111111-1111-1111-1111-111111111111",
    title: "Morning bulletin",
    subtitle: null,
    description: null,
    category: "News",
    imageUrl: null,
    startAt: "2026-04-03T09:00:00.000Z",
    endAt: "2026-04-03T10:00:00.000Z",
    createdAt: "2026-04-03T08:55:00.000Z",
    updatedAt: "2026-04-03T08:55:00.000Z",
    channel: {
      id: "11111111-1111-1111-1111-111111111111",
      name: "News Desk",
      slug: "news-desk",
      isActive: true,
    },
    ...overrides,
  };
}

describe("manual-program-form-state", () => {
  it("builds a form from an existing manual programme", () => {
    expect(buildManualProgramForm(buildProgram())).toMatchObject({
      title: "Morning bulletin",
      category: "News",
      startAtLocal: formatLocal("2026-04-03T09:00:00.000Z"),
      endAtLocal: formatLocal("2026-04-03T10:00:00.000Z"),
    });
  });

  it("reports missing required fields before save", () => {
    const result = validateManualProgramForm({
      channelId: "",
      form: createEmptyManualProgramForm(),
      existingPrograms: [],
    });

    expect(result.isValid).toBe(false);
    expect(result.payload).toBeNull();
    expect(result.issues.map((issue) => issue.message)).toEqual([
      "Select a channel before saving a manual programme.",
      "Title is required.",
      "Start time is required.",
      "End time is required.",
    ]);
  });

  it("rejects invalid time ranges and overlapping rows", () => {
    const invalidRange = validateManualProgramForm({
      channelId: "11111111-1111-1111-1111-111111111111",
      form: {
        ...createEmptyManualProgramForm(),
        title: "Bad schedule",
        startAtLocal: "2026-04-03T10:00",
        endAtLocal: "2026-04-03T09:00",
      },
      existingPrograms: [],
    });

    expect(invalidRange.isValid).toBe(false);
    expect(invalidRange.issues.map((issue) => issue.message)).toContain("End time must be after start time.");

    const overlap = validateManualProgramForm({
      channelId: "11111111-1111-1111-1111-111111111111",
      form: {
        ...createEmptyManualProgramForm(),
        title: "Mid-morning bulletin",
        startAtLocal: formatLocal("2026-04-03T09:30:00.000Z"),
        endAtLocal: formatLocal("2026-04-03T10:15:00.000Z"),
      },
      existingPrograms: [buildProgram()],
    });

    expect(overlap.isValid).toBe(false);
    expect(overlap.overlappingPrograms).toHaveLength(1);
    expect(overlap.issues.map((issue) => issue.message)).toContain(
      "This time range overlaps another manual programme on the selected channel.",
    );
  });

  it("creates a valid payload and ignores the edited row during overlap checks", () => {
    const currentProgram = buildProgram();
    const result = validateManualProgramForm({
      channelId: "11111111-1111-1111-1111-111111111111",
      form: {
        title: "  Morning bulletin  ",
        subtitle: "",
        startAtLocal: "2026-04-03T09:00",
        endAtLocal: "2026-04-03T10:30",
        description: "  Extended coverage  ",
        category: "  News  ",
        imageUrl: "",
      },
      existingPrograms: [currentProgram],
      editingProgramId: currentProgram.id,
    });

    expect(result.isValid).toBe(true);
    expect(result.overlappingPrograms).toEqual([]);
    expect(result.durationMinutes).toBe(90);
    expect(result.payload).toMatchObject({
      channelId: "11111111-1111-1111-1111-111111111111",
      title: "Morning bulletin",
      description: "Extended coverage",
      category: "News",
    });
  });

  it("derives live and upcoming status from manual rows", () => {
    expect(getManualProgramStatus(buildProgram(), new Date("2026-04-03T09:30:00.000Z"))).toBe("live");
    expect(
      getManualProgramStatus(
        buildProgram({
          startAt: "2026-04-03T11:00:00.000Z",
          endAt: "2026-04-03T12:00:00.000Z",
        }),
        new Date("2026-04-03T09:30:00.000Z"),
      ),
    ).toBe("upcoming");
  });
});
