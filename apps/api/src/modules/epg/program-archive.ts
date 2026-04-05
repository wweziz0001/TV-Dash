export type GuideProgramTimingState = "PREVIOUS" | "LIVE_NOW" | "UPCOMING";

export type ProgramCatchupPlaybackState =
  | "LIVE_NOW"
  | "LIVE_WATCH_FROM_START"
  | "UPCOMING"
  | "PREVIOUS_NOT_AVAILABLE"
  | "PREVIOUS_RECORDING"
  | "PREVIOUS_TIMESHIFT"
  | "PREVIOUS_RECORDING_AND_TIMESHIFT";

export type ProgramArchiveStatus =
  | "LIVE_NOW"
  | "LIVE_RESTARTABLE"
  | "UPCOMING"
  | "AIRED_UNAVAILABLE"
  | "AIRED_CATCHUP"
  | "AIRED_RECORDED"
  | "AIRED_ARCHIVED";

export type ProgramArchiveAccess = "NONE" | "TIMESHIFT" | "RECORDING" | "RECORDING_AND_TIMESHIFT";

export interface ProgramArchiveAvailability {
  archiveStatus: ProgramArchiveStatus;
  archiveAccess: ProgramArchiveAccess;
  hasRecordingSource: boolean;
  hasTimeshiftSource: boolean;
  isArchivePlayable: boolean;
}

export function resolveProgramArchiveAvailability(params: {
  timingState: GuideProgramTimingState;
  playbackState: ProgramCatchupPlaybackState;
}): ProgramArchiveAvailability {
  switch (params.playbackState) {
    case "LIVE_WATCH_FROM_START":
      return {
        archiveStatus: "LIVE_RESTARTABLE",
        archiveAccess: "TIMESHIFT",
        hasRecordingSource: false,
        hasTimeshiftSource: true,
        isArchivePlayable: true,
      };
    case "LIVE_NOW":
      return {
        archiveStatus: "LIVE_NOW",
        archiveAccess: "NONE",
        hasRecordingSource: false,
        hasTimeshiftSource: false,
        isArchivePlayable: false,
      };
    case "UPCOMING":
      return {
        archiveStatus: "UPCOMING",
        archiveAccess: "NONE",
        hasRecordingSource: false,
        hasTimeshiftSource: false,
        isArchivePlayable: false,
      };
    case "PREVIOUS_RECORDING_AND_TIMESHIFT":
      return {
        archiveStatus: "AIRED_ARCHIVED",
        archiveAccess: "RECORDING_AND_TIMESHIFT",
        hasRecordingSource: true,
        hasTimeshiftSource: true,
        isArchivePlayable: true,
      };
    case "PREVIOUS_RECORDING":
      return {
        archiveStatus: "AIRED_RECORDED",
        archiveAccess: "RECORDING",
        hasRecordingSource: true,
        hasTimeshiftSource: false,
        isArchivePlayable: true,
      };
    case "PREVIOUS_TIMESHIFT":
      return {
        archiveStatus: "AIRED_CATCHUP",
        archiveAccess: "TIMESHIFT",
        hasRecordingSource: false,
        hasTimeshiftSource: true,
        isArchivePlayable: true,
      };
    case "PREVIOUS_NOT_AVAILABLE":
    default:
      return {
        archiveStatus: params.timingState === "UPCOMING" ? "UPCOMING" : "AIRED_UNAVAILABLE",
        archiveAccess: "NONE",
        hasRecordingSource: false,
        hasTimeshiftSource: false,
        isArchivePlayable: false,
      };
  }
}
