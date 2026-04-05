import { describe, expect, it } from "vitest";
import { resolveProgramArchiveAvailability } from "./program-archive.js";

describe("program-archive", () => {
  it("keeps live-now and live-restartable states explicit", () => {
    expect(
      resolveProgramArchiveAvailability({
        timingState: "LIVE_NOW",
        playbackState: "LIVE_NOW",
      }),
    ).toEqual({
      archiveStatus: "LIVE_NOW",
      archiveAccess: "NONE",
      hasRecordingSource: false,
      hasTimeshiftSource: false,
      isArchivePlayable: false,
    });

    expect(
      resolveProgramArchiveAvailability({
        timingState: "LIVE_NOW",
        playbackState: "LIVE_WATCH_FROM_START",
      }),
    ).toEqual({
      archiveStatus: "LIVE_RESTARTABLE",
      archiveAccess: "TIMESHIFT",
      hasRecordingSource: false,
      hasTimeshiftSource: true,
      isArchivePlayable: true,
    });
  });

  it("treats recording-backed previous programmes as recorded archive entries", () => {
    expect(
      resolveProgramArchiveAvailability({
        timingState: "PREVIOUS",
        playbackState: "PREVIOUS_RECORDING",
      }),
    ).toEqual({
      archiveStatus: "AIRED_RECORDED",
      archiveAccess: "RECORDING",
      hasRecordingSource: true,
      hasTimeshiftSource: false,
      isArchivePlayable: true,
    });
  });

  it("treats dual-source previous programmes as archived channel history", () => {
    expect(
      resolveProgramArchiveAvailability({
        timingState: "PREVIOUS",
        playbackState: "PREVIOUS_RECORDING_AND_TIMESHIFT",
      }),
    ).toEqual({
      archiveStatus: "AIRED_ARCHIVED",
      archiveAccess: "RECORDING_AND_TIMESHIFT",
      hasRecordingSource: true,
      hasTimeshiftSource: true,
      isArchivePlayable: true,
    });
  });

  it("marks previous programmes with no source as unavailable archive entries", () => {
    expect(
      resolveProgramArchiveAvailability({
        timingState: "PREVIOUS",
        playbackState: "PREVIOUS_NOT_AVAILABLE",
      }),
    ).toEqual({
      archiveStatus: "AIRED_UNAVAILABLE",
      archiveAccess: "NONE",
      hasRecordingSource: false,
      hasTimeshiftSource: false,
      isArchivePlayable: false,
    });
  });
});
