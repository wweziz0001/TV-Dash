import {
  resolveProgramArchiveAvailability,
  type GuideProgramTimingState,
  type ProgramArchiveAccess,
  type ProgramArchiveStatus,
  type ProgramCatchupPlaybackState,
} from "./program-archive.js";

export type CatchupSourceType = "RECORDING" | "TIMESHIFT";
export type RecordingMatchType = "LINKED" | "OVERLAP";

export interface RecordingCatchupCandidate {
  recordingJobId: string;
  programEntryId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
}

export interface TimeshiftCatchupWindow {
  availableFromAt: Date;
  availableUntilAt: Date;
}

export interface ProgramCatchupSourceSummary {
  sourceType: CatchupSourceType;
  isPreferred: boolean;
  availableFromAt: string;
  availableUntilAt: string;
  recordingJobId?: string;
  recordingTitle?: string;
  recordingMatchType?: RecordingMatchType;
}

export interface ProgramCatchupSummary {
  timingState: GuideProgramTimingState;
  playbackState: ProgramCatchupPlaybackState;
  archiveStatus: ProgramArchiveStatus;
  archiveAccess: ProgramArchiveAccess;
  hasRecordingSource: boolean;
  hasTimeshiftSource: boolean;
  isCatchupPlayable: boolean;
  watchFromStartAvailable: boolean;
  preferredSourceType: CatchupSourceType | null;
  availableUntilAt: string | null;
  sources: ProgramCatchupSourceSummary[];
}

interface ProgramWindow {
  id: string;
  startAt: Date;
  endAt: Date | null;
}

const PROGRAM_BOUNDARY_TOLERANCE_MS = 60_000;
const MIN_RECORDING_COVERAGE_RATIO = 0.9;

function getProgramTimingState(program: ProgramWindow, now: Date): GuideProgramTimingState {
  if (program.startAt > now) {
    return "UPCOMING";
  }

  if (!program.endAt || program.endAt > now) {
    return "LIVE_NOW";
  }

  return "PREVIOUS";
}

function getOverlapDurationMs(leftStartAt: Date, leftEndAt: Date, rightStartAt: Date, rightEndAt: Date) {
  const overlapStartMs = Math.max(leftStartAt.getTime(), rightStartAt.getTime());
  const overlapEndMs = Math.min(leftEndAt.getTime(), rightEndAt.getTime());

  return Math.max(0, overlapEndMs - overlapStartMs);
}

function getRecordingCoverageRatio(program: { startAt: Date; endAt: Date }, candidate: RecordingCatchupCandidate) {
  const programDurationMs = Math.max(1, program.endAt.getTime() - program.startAt.getTime());
  const overlapDurationMs = getOverlapDurationMs(program.startAt, program.endAt, candidate.startsAt, candidate.endsAt);

  return Math.min(1, overlapDurationMs / programDurationMs);
}

function isRecordingCandidatePlayable(program: { startAt: Date; endAt: Date }, candidate: RecordingCatchupCandidate) {
  const startsCloseEnough = candidate.startsAt.getTime() <= program.startAt.getTime() + PROGRAM_BOUNDARY_TOLERANCE_MS;
  const endsCloseEnough = candidate.endsAt.getTime() >= program.endAt.getTime() - PROGRAM_BOUNDARY_TOLERANCE_MS;

  if (startsCloseEnough && endsCloseEnough) {
    return true;
  }

  return getRecordingCoverageRatio(program, candidate) >= MIN_RECORDING_COVERAGE_RATIO;
}

function compareRecordingCandidates(program: ProgramWindow, left: RecordingCatchupCandidate, right: RecordingCatchupCandidate) {
  const leftLinked = left.programEntryId === program.id ? 1 : 0;
  const rightLinked = right.programEntryId === program.id ? 1 : 0;

  if (leftLinked !== rightLinked) {
    return rightLinked - leftLinked;
  }

  const coverageDifference = getRecordingCoverageRatio(
    {
      startAt: program.startAt,
      endAt: program.endAt ?? program.startAt,
    },
    right,
  ) - getRecordingCoverageRatio(
    {
      startAt: program.startAt,
      endAt: program.endAt ?? program.startAt,
    },
    left,
  );

  if (Math.abs(coverageDifference) > 0.0001) {
    return coverageDifference > 0 ? 1 : -1;
  }

  return right.endsAt.getTime() - left.endsAt.getTime();
}

export function selectPreferredRecordingCatchupCandidate(
  program: ProgramWindow,
  candidates: RecordingCatchupCandidate[],
) {
  if (!program.endAt) {
    return null;
  }

  const playableCandidates = candidates.filter((candidate) => isRecordingCandidatePlayable({ startAt: program.startAt, endAt: program.endAt! }, candidate));

  if (playableCandidates.length === 0) {
    return null;
  }

  const sortedCandidates = [...playableCandidates].sort((left, right) => compareRecordingCandidates(program, left, right));
  const bestCandidate = sortedCandidates[0];

  if (!bestCandidate) {
    return null;
  }

  return {
    candidate: bestCandidate,
    matchType: bestCandidate.programEntryId === program.id ? ("LINKED" as const) : ("OVERLAP" as const),
  };
}

function isTimeshiftWindowPlayable(program: ProgramWindow, window: TimeshiftCatchupWindow | null) {
  if (!window || !program.endAt) {
    return false;
  }

  return (
    window.availableFromAt.getTime() <= program.startAt.getTime() + PROGRAM_BOUNDARY_TOLERANCE_MS &&
    window.availableUntilAt.getTime() >= program.endAt.getTime() - PROGRAM_BOUNDARY_TOLERANCE_MS
  );
}

function isWatchFromStartAvailable(program: ProgramWindow, window: TimeshiftCatchupWindow | null, now: Date) {
  if (!window) {
    return false;
  }

  const timingState = getProgramTimingState(program, now);

  if (timingState !== "LIVE_NOW") {
    return false;
  }

  return window.availableFromAt.getTime() <= program.startAt.getTime() + PROGRAM_BOUNDARY_TOLERANCE_MS;
}

export function resolveProgramCatchupSummary(params: {
  program: ProgramWindow;
  now: Date;
  recordingCandidates: RecordingCatchupCandidate[];
  timeshiftWindow: TimeshiftCatchupWindow | null;
}) {
  function buildSummary(playbackState: ProgramCatchupPlaybackState, base: Omit<ProgramCatchupSummary, "timingState" | "playbackState" | "archiveStatus" | "archiveAccess" | "hasRecordingSource" | "hasTimeshiftSource">) {
    const archiveAvailability = resolveProgramArchiveAvailability({
      timingState,
      playbackState,
    });

    return {
      timingState,
      playbackState,
      archiveStatus: archiveAvailability.archiveStatus,
      archiveAccess: archiveAvailability.archiveAccess,
      hasRecordingSource: archiveAvailability.hasRecordingSource,
      hasTimeshiftSource: archiveAvailability.hasTimeshiftSource,
      ...base,
    } satisfies ProgramCatchupSummary;
  }

  const timingState = getProgramTimingState(params.program, params.now);
  const preferredRecording = selectPreferredRecordingCatchupCandidate(params.program, params.recordingCandidates);
  const timeshiftPlayable = isTimeshiftWindowPlayable(params.program, params.timeshiftWindow);
  const watchFromStartAvailable = isWatchFromStartAvailable(params.program, params.timeshiftWindow, params.now);
  const sources: ProgramCatchupSourceSummary[] = [];

  if (preferredRecording) {
    sources.push({
      sourceType: "RECORDING",
      isPreferred: true,
      availableFromAt: preferredRecording.candidate.startsAt.toISOString(),
      availableUntilAt: preferredRecording.candidate.endsAt.toISOString(),
      recordingJobId: preferredRecording.candidate.recordingJobId,
      recordingTitle: preferredRecording.candidate.title,
      recordingMatchType: preferredRecording.matchType,
    });
  }

  if (timeshiftPlayable && params.timeshiftWindow) {
    sources.push({
      sourceType: "TIMESHIFT",
      isPreferred: !preferredRecording,
      availableFromAt: params.timeshiftWindow.availableFromAt.toISOString(),
      availableUntilAt: params.timeshiftWindow.availableUntilAt.toISOString(),
    });
  }

  if (timingState === "UPCOMING") {
    return buildSummary("UPCOMING", {
      isCatchupPlayable: false,
      watchFromStartAvailable: false,
      preferredSourceType: null,
      availableUntilAt: null,
      sources: [],
    });
  }

  if (timingState === "LIVE_NOW") {
    return buildSummary(watchFromStartAvailable ? "LIVE_WATCH_FROM_START" : "LIVE_NOW", {
      isCatchupPlayable: false,
      watchFromStartAvailable,
      preferredSourceType: watchFromStartAvailable ? "TIMESHIFT" : null,
      availableUntilAt: params.timeshiftWindow?.availableUntilAt.toISOString() ?? null,
      sources: watchFromStartAvailable && params.timeshiftWindow
        ? [
            {
              sourceType: "TIMESHIFT",
              isPreferred: true,
              availableFromAt: params.timeshiftWindow.availableFromAt.toISOString(),
              availableUntilAt: params.timeshiftWindow.availableUntilAt.toISOString(),
            },
          ]
        : [],
    });
  }

  const hasRecording = Boolean(preferredRecording);
  const hasTimeshift = timeshiftPlayable;
  const preferredSourceType = hasRecording ? "RECORDING" : hasTimeshift ? "TIMESHIFT" : null;

  return buildSummary(
    hasRecording && hasTimeshift
      ? "PREVIOUS_RECORDING_AND_TIMESHIFT"
      : hasRecording
        ? "PREVIOUS_RECORDING"
        : hasTimeshift
          ? "PREVIOUS_TIMESHIFT"
          : "PREVIOUS_NOT_AVAILABLE",
    {
      isCatchupPlayable: hasRecording || hasTimeshift,
      watchFromStartAvailable: false,
      preferredSourceType,
      availableUntilAt:
        preferredSourceType === "RECORDING"
          ? preferredRecording?.candidate.endsAt.toISOString() ?? null
          : params.timeshiftWindow?.availableUntilAt.toISOString() ?? null,
      sources,
    },
  );
}
