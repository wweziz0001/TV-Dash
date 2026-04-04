import { describe, expect, it } from "vitest";
import { buildPlayerDiagnostics, getPlaybackTone } from "./playback-diagnostics";

describe("playback-diagnostics", () => {
  it("reports recovered playback with success tone", () => {
    const diagnostics = buildPlayerDiagnostics({
      status: "playing",
      muted: false,
      recoveryNotice: "Stream recovered",
    });

    expect(diagnostics).toMatchObject({
      label: "Recovered",
      summary: "Stream recovered",
      recoveryState: "recovered",
      isMuted: false,
    });
    expect(getPlaybackTone(diagnostics)).toBe("success");
  });

  it("maps failed playback into operator-friendly detail", () => {
    const diagnostics = buildPlayerDiagnostics({
      status: "error",
      error: "The stream manifest was received but could not be parsed.",
      failureKind: "invalid-playlist",
      muted: true,
    });

    expect(diagnostics).toMatchObject({
      label: "Failed",
      summary: "The stream manifest was received but could not be parsed.",
      technicalDetail: "Failure class: invalid-playlist",
      failureKind: "invalid-playlist",
    });
    expect(getPlaybackTone(diagnostics)).toBe("danger");
  });

  it("reflects paused playback as a visible neutral state without faking an error", () => {
    const diagnostics = buildPlayerDiagnostics({
      status: "playing",
      muted: false,
      isPaused: true,
      canSeek: true,
    });

    expect(diagnostics).toMatchObject({
      label: "Paused",
      summary: "Playback is paused inside the live DVR window.",
      isPaused: true,
      canSeek: true,
    });
    expect(getPlaybackTone(diagnostics)).toBe("neutral");
  });
});
