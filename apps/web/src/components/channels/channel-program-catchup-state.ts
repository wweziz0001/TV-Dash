import type { NowNextProgram } from "@/types/api";

export interface ProgramCatchupBadge {
  label: string;
  tone: "live" | "positive" | "warning" | "neutral";
}

export function getProgramCatchupBadges(program: NowNextProgram): ProgramCatchupBadge[] {
  const catchup = program.catchup;

  if (!catchup) {
    return [];
  }

  const badges: ProgramCatchupBadge[] = [];

  if (catchup.timingState === "LIVE_NOW") {
    badges.push({ label: "Live", tone: "live" });
  }

  if (catchup.timingState === "UPCOMING") {
    badges.push({ label: "Next", tone: "neutral" });
  }

  if (catchup.timingState === "PREVIOUS") {
    badges.push({ label: "Earlier", tone: "neutral" });
  }

  if (catchup.playbackState === "LIVE_WATCH_FROM_START") {
    badges.push({ label: "Watch from start", tone: "positive" });
  }

  if (catchup.playbackState === "PREVIOUS_RECORDING" || catchup.playbackState === "PREVIOUS_RECORDING_AND_TIMESHIFT") {
    badges.push({ label: "Recording", tone: "positive" });
  }

  if (catchup.playbackState === "PREVIOUS_TIMESHIFT" || catchup.playbackState === "PREVIOUS_RECORDING_AND_TIMESHIFT") {
    badges.push({ label: "DVR window", tone: "warning" });
  }

  if (catchup.playbackState === "LIVE_WATCH_FROM_START") {
    badges.push({ label: "DVR window", tone: "warning" });
  }

  if (catchup.playbackState === "PREVIOUS_NOT_AVAILABLE") {
    badges.push({ label: "Not available", tone: "neutral" });
  }

  return badges;
}

export function getProgramCatchupCopy(program: NowNextProgram) {
  const catchup = program.catchup;

  if (!catchup) {
    return null;
  }

  switch (catchup.playbackState) {
    case "LIVE_WATCH_FROM_START":
      return "Watch from the programme start while the retained DVR window still covers it.";
    case "PREVIOUS_RECORDING":
      return "Playable from a linked recording.";
    case "PREVIOUS_TIMESHIFT":
      return "Playable while this programme remains inside the retained DVR window.";
    case "PREVIOUS_RECORDING_AND_TIMESHIFT":
      return "Recording playback is preferred, with the retained DVR window still available for now.";
    case "PREVIOUS_NOT_AVAILABLE":
      return "No linked recording or retained DVR coverage currently matches this programme.";
    default:
      return null;
  }
}

