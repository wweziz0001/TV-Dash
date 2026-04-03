import { describe, expect, it } from "vitest";
import { classifyEpgFailure } from "./epg-diagnostics.js";

describe("epg-diagnostics", () => {
  it("classifies xmltv parse failures separately from fetch failures", () => {
    const result = classifyEpgFailure(new Error("Invalid XMLTV document"));

    expect(result).toEqual({
      failureKind: "epg-parse",
      message: "Invalid XMLTV document",
      retryable: false,
      statusCode: null,
    });
  });

  it("classifies upstream xmltv failures as retryable when the source returns 5xx", () => {
    const result = classifyEpgFailure(new Error("EPG upstream returned 503"));

    expect(result).toEqual({
      failureKind: "epg-fetch",
      message: "EPG upstream returned 503",
      retryable: true,
      statusCode: 503,
    });
  });
});
