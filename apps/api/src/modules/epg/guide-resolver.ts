import type { ProgramEntrySource } from "@tv-dash/shared";

export interface GuideProgramRecord {
  id: string;
  sourceKind: ProgramEntrySource;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  startAt: Date;
  endAt: Date | null;
}

export function sortGuideProgrammes(programmes: GuideProgramRecord[]) {
  return [...programmes].sort((left, right) => {
    const startComparison = left.startAt.getTime() - right.startAt.getTime();

    if (startComparison !== 0) {
      return startComparison;
    }

    const leftEnd = left.endAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightEnd = right.endAt?.getTime() ?? Number.POSITIVE_INFINITY;

    if (leftEnd !== rightEnd) {
      return leftEnd - rightEnd;
    }

    if (left.sourceKind !== right.sourceKind) {
      return left.sourceKind === "MANUAL" ? -1 : 1;
    }

    return left.title.localeCompare(right.title);
  });
}

function cloneProgramme(programme: GuideProgramRecord, patch: Partial<GuideProgramRecord>): GuideProgramRecord {
  return {
    ...programme,
    ...patch,
  };
}

function programmesOverlap(left: GuideProgramRecord, right: GuideProgramRecord) {
  const leftStart = left.startAt.getTime();
  const leftEnd = left.endAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightStart = right.startAt.getTime();
  const rightEnd = right.endAt?.getTime() ?? Number.POSITIVE_INFINITY;

  return leftStart < rightEnd && rightStart < leftEnd;
}

function subtractManualOverride(programme: GuideProgramRecord, manualEntry: GuideProgramRecord) {
  const manualEndAt = manualEntry.endAt ?? manualEntry.startAt;

  if (!programmesOverlap(programme, manualEntry)) {
    return [programme];
  }

  const segments: GuideProgramRecord[] = [];

  if (programme.startAt < manualEntry.startAt) {
    segments.push(cloneProgramme(programme, { endAt: manualEntry.startAt }));
  }

  if (programme.endAt && programme.endAt > manualEndAt) {
    segments.push(cloneProgramme(programme, { startAt: manualEndAt }));
  }

  return segments;
}

export function resolveGuideProgrammes({
  imported,
  manual,
}: {
  imported: GuideProgramRecord[];
  manual: GuideProgramRecord[];
}) {
  let resolvedImported = sortGuideProgrammes(imported);

  for (const manualEntry of sortGuideProgrammes(manual)) {
    resolvedImported = resolvedImported.flatMap((programme) => subtractManualOverride(programme, manualEntry));
  }

  return sortGuideProgrammes([...resolvedImported, ...manual]);
}

export function getNowNextProgrammes(programmes: GuideProgramRecord[], at = new Date()) {
  const sorted = sortGuideProgrammes(programmes);
  const now =
    sorted.find((programme) => programme.startAt <= at && (!programme.endAt || programme.endAt > at)) ?? null;
  const next =
    sorted.find((programme) => programme.startAt > at && (!now || programme.startAt >= now.startAt)) ?? null;

  return {
    now,
    next,
  };
}
