import Hls from "hls.js";
import { describe, expect, it } from "vitest";
import { getFatalRecoveryAction } from "./playback-recovery";

describe("getFatalRecoveryAction", () => {
  it("bounds network retries and exposes retry messaging", () => {
    expect(
      getFatalRecoveryAction(Hls.ErrorTypes.NETWORK_ERROR, "manifestLoadError", {
        networkAttempts: 0,
        mediaAttempts: 0,
      }),
    ).toEqual({
      kind: "retry-network",
      delayMs: 1500,
      networkAttempts: 1,
      message: "Connection lost. Retrying stream startup (1/3).",
      failureKind: "network",
    });

    expect(
      getFatalRecoveryAction(Hls.ErrorTypes.NETWORK_ERROR, "fragLoadError", {
        networkAttempts: 3,
        mediaAttempts: 0,
      }),
    ).toEqual({
      kind: "fail",
      message: "A live stream request could not be completed.",
      failureKind: "network",
    });
  });

  it("allows a single media recovery before failing", () => {
    expect(
      getFatalRecoveryAction(Hls.ErrorTypes.MEDIA_ERROR, "bufferAppendError", {
        networkAttempts: 0,
        mediaAttempts: 0,
      }),
    ).toEqual({
      kind: "recover-media",
      mediaAttempts: 1,
      message: "Playback stalled. Attempting browser media recovery (1/1).",
      failureKind: "media-playback",
    });

    expect(
      getFatalRecoveryAction(Hls.ErrorTypes.MEDIA_ERROR, "bufferAppendError", {
        networkAttempts: 0,
        mediaAttempts: 1,
      }),
    ).toEqual({
      kind: "fail",
      message: "The browser could not append new media data.",
      failureKind: "media-playback",
    });
  });
});
