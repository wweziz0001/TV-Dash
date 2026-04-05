import type { NowNextProgram, ProgramCatchupSummary } from "@/types/api";

export interface ProgramCatchupBadge {
  label: string;
  tone: "live" | "positive" | "warning" | "neutral";
}

export function getCatchupBadges(catchup: ProgramCatchupSummary | null): ProgramCatchupBadge[] {
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

  if (catchup.archiveStatus === "LIVE_RESTARTABLE") {
    badges.push({ label: "Watch from start", tone: "positive" });
  }

  if (catchup.hasRecordingSource) {
    badges.push({ label: "Recording", tone: "positive" });
  }

  if (catchup.hasTimeshiftSource) {
    badges.push({ label: "DVR window", tone: "warning" });
  }

  if (catchup.archiveStatus === "AIRED_UNAVAILABLE") {
    badges.push({ label: "Not available", tone: "neutral" });
  }

  return badges;
}

export function getCatchupCopy(catchup: ProgramCatchupSummary | null) {
  if (!catchup) {
    return null;
  }

  switch (catchup.archiveStatus) {
    case "LIVE_RESTARTABLE":
      return "Watch from the programme start while the retained DVR window still covers it.";
    case "AIRED_RECORDED":
      return "Playable from a linked recording.";
    case "AIRED_CATCHUP":
      return "Playable while this programme remains inside the retained DVR window.";
    case "AIRED_ARCHIVED":
      return "Recording playback is preferred, with the retained DVR window still available for now.";
    case "AIRED_UNAVAILABLE":
      return "No linked recording or retained DVR coverage currently matches this programme.";
    default:
      return null;
  }
}

export function getProgramCatchupBadges(program: NowNextProgram): ProgramCatchupBadge[] {
  return getCatchupBadges(program.catchup);
}

export function getProgramCatchupCopy(program: NowNextProgram) {
  return getCatchupCopy(program.catchup);
}
