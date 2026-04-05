import type { RecordingJobStatus } from "@prisma/client";
import { resolveProgramCatchupSummary, type ProgramCatchupSummary, type TimeshiftCatchupWindow } from "../epg/program-catchup.js";

export interface RecordingArchiveContext {
  programId: string | null;
  hasProgramLink: boolean;
  startAt: string;
  endAt: string | null;
  catchup: ProgramCatchupSummary;
}

export interface RecordingArchiveSourceRecord {
  id: string;
  status: RecordingJobStatus;
  title: string;
  programEntryId: string | null;
  programStartAt: Date | null;
  programEndAt: Date | null;
  startAt: Date;
  endAt: Date | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  programEntry: {
    id: string;
    startAt: Date;
    endAt: Date | null;
  } | null;
  asset: {
    startedAt: Date;
    endedAt: Date;
  } | null;
}

function resolveArchiveProgrammeWindow(recording: RecordingArchiveSourceRecord) {
  const startAt = recording.programEntry?.startAt ?? recording.programStartAt ?? recording.asset?.startedAt ?? recording.actualStartAt ?? recording.startAt;
  const endAt = recording.programEntry?.endAt ?? recording.programEndAt ?? recording.asset?.endedAt ?? recording.actualEndAt ?? recording.endAt;

  if (!startAt) {
    return null;
  }

  return {
    id: recording.programEntry?.id ?? recording.programEntryId ?? recording.id,
    startAt,
    endAt,
  };
}

function buildRecordingCatchupCandidates(recording: RecordingArchiveSourceRecord) {
  const candidateStartAt = recording.asset?.startedAt ?? recording.actualStartAt ?? recording.startAt;
  const candidateEndAt = recording.asset?.endedAt ?? recording.actualEndAt ?? recording.endAt;

  if (recording.status !== "COMPLETED" || !candidateStartAt || !candidateEndAt) {
    return [];
  }

  return [
    {
      recordingJobId: recording.id,
      programEntryId: recording.programEntry?.id ?? recording.programEntryId,
      title: recording.title,
      startsAt: candidateStartAt,
      endsAt: candidateEndAt,
    },
  ];
}

export function resolveRecordingArchiveContext(params: {
  recording: RecordingArchiveSourceRecord;
  now: Date;
  timeshiftWindow: TimeshiftCatchupWindow | null;
}): RecordingArchiveContext | null {
  const programmeWindow = resolveArchiveProgrammeWindow(params.recording);

  if (!programmeWindow) {
    return null;
  }

  const catchup = resolveProgramCatchupSummary({
    program: programmeWindow,
    now: params.now,
    recordingCandidates: buildRecordingCatchupCandidates(params.recording),
    timeshiftWindow: params.timeshiftWindow,
  });

  return {
    programId: params.recording.programEntry?.id ?? params.recording.programEntryId,
    hasProgramLink: Boolean(params.recording.programEntry?.id ?? params.recording.programEntryId),
    startAt: programmeWindow.startAt.toISOString(),
    endAt: programmeWindow.endAt?.toISOString() ?? null,
    catchup,
  };
}
