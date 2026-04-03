import { describe, expect, it } from "vitest";
import { classifyStreamFailure } from "./stream-diagnostics.js";

describe("stream-diagnostics", () => {
  it("classifies upstream playlist failures as retryable when the upstream status is 5xx", () => {
    const result = classifyStreamFailure(new Error("Upstream returned 503"), {
      operation: "proxy-master",
    });

    expect(result).toEqual({
      failureKind: "playlist-fetch",
      message: "Upstream returned 503",
      retryable: true,
      statusCode: 503,
    });
  });

  it("classifies invalid proxy tokens as validation failures", () => {
    const result = classifyStreamFailure(new Error("Invalid or expired proxy token"), {
      operation: "proxy-asset",
    });

    expect(result).toEqual({
      failureKind: "validation",
      message: "Invalid or expired proxy token",
      retryable: false,
      statusCode: 400,
    });
  });

  it("classifies invalid playlist bodies clearly", () => {
    const result = classifyStreamFailure(new Error("Invalid HLS playlist response"), {
      operation: "stream-inspection",
    });

    expect(result).toEqual({
      failureKind: "invalid-playlist",
      message: "Invalid HLS playlist response",
      retryable: false,
      statusCode: null,
    });
  });

  it("treats aborted upstream requests as retryable network failures", () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    const result = classifyStreamFailure(abortError, {
      operation: "stream-inspection",
    });

    expect(result).toEqual({
      failureKind: "network",
      message: "Upstream request timed out",
      retryable: true,
      statusCode: null,
    });
  });
});
