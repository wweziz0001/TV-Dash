export interface TimeshiftWindowSegment {
  durationSeconds: number;
  programDateTime: string | null;
  capturedAtMs: number;
}

export function getTimeshiftSegmentTimestampMs(segment: TimeshiftWindowSegment) {
  const programDateTimeMs = segment.programDateTime ? Date.parse(segment.programDateTime) : Number.NaN;

  return Number.isFinite(programDateTimeMs) ? programDateTimeMs : segment.capturedAtMs;
}

export function getAvailableTimeshiftWindowSeconds(segments: TimeshiftWindowSegment[]) {
  return segments.reduce((total, segment) => total + segment.durationSeconds, 0);
}

export function partitionTimeshiftSegmentsByCutoff<TSegment extends TimeshiftWindowSegment>(
  segments: TSegment[],
  cutoffMs: number,
) {
  const retained: TSegment[] = [];
  const evicted: TSegment[] = [];

  segments.forEach((segment) => {
    if (getTimeshiftSegmentTimestampMs(segment) < cutoffMs) {
      evicted.push(segment);
      return;
    }

    retained.push(segment);
  });

  return {
    retained,
    evicted,
  };
}
