import { describe, expect, it } from "vitest";
import { getNowNextProgrammes, resolveGuideProgrammes, type GuideProgramRecord } from "./guide-resolver.js";

function buildProgramme(input: Partial<GuideProgramRecord> & Pick<GuideProgramRecord, "id" | "title" | "startAt">): GuideProgramRecord {
  return {
    id: input.id,
    sourceKind: input.sourceKind ?? "IMPORTED",
    title: input.title,
    subtitle: input.subtitle ?? null,
    description: input.description ?? null,
    category: input.category ?? null,
    imageUrl: input.imageUrl ?? null,
    startAt: input.startAt,
    endAt: input.endAt ?? null,
  };
}

describe("resolveGuideProgrammes", () => {
  it("lets manual entries override imported rows only for the overlapping window", () => {
    const imported = [
      buildProgramme({
        id: "imported-1",
        title: "Imported block",
        startAt: new Date("2026-04-03T09:00:00.000Z"),
        endAt: new Date("2026-04-03T11:00:00.000Z"),
      }),
    ];
    const manual = [
      buildProgramme({
        id: "manual-1",
        sourceKind: "MANUAL",
        title: "Manual override",
        startAt: new Date("2026-04-03T10:00:00.000Z"),
        endAt: new Date("2026-04-03T10:30:00.000Z"),
      }),
    ];

    const resolved = resolveGuideProgrammes({ imported, manual });

    expect(resolved.map((programme) => programme.title)).toEqual([
      "Imported block",
      "Manual override",
      "Imported block",
    ]);
    expect(resolved[0]?.endAt?.toISOString()).toBe("2026-04-03T10:00:00.000Z");
    expect(resolved[1]?.sourceKind).toBe("MANUAL");
    expect(resolved[2]?.startAt.toISOString()).toBe("2026-04-03T10:30:00.000Z");
  });
});

describe("getNowNextProgrammes", () => {
  it("resolves now and next from the merged guide set", () => {
    const resolved = resolveGuideProgrammes({
      imported: [
        buildProgramme({
          id: "imported-1",
          title: "Morning feed",
          startAt: new Date("2026-04-03T09:00:00.000Z"),
          endAt: new Date("2026-04-03T10:00:00.000Z"),
        }),
        buildProgramme({
          id: "imported-2",
          title: "Imported follow-up",
          startAt: new Date("2026-04-03T10:00:00.000Z"),
          endAt: new Date("2026-04-03T11:00:00.000Z"),
        }),
      ],
      manual: [
        buildProgramme({
          id: "manual-1",
          sourceKind: "MANUAL",
          title: "Manual bulletin",
          startAt: new Date("2026-04-03T10:00:00.000Z"),
          endAt: new Date("2026-04-03T10:15:00.000Z"),
        }),
      ],
    });

    const result = getNowNextProgrammes(resolved, new Date("2026-04-03T10:05:00.000Z"));

    expect(result.now?.title).toBe("Manual bulletin");
    expect(result.next?.title).toBe("Imported follow-up");
    expect(result.next?.startAt.toISOString()).toBe("2026-04-03T10:15:00.000Z");
  });
});
