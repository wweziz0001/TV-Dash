import { describe, expect, it } from "vitest";
import { buildQualityOptions, resolvePreferredQuality } from "./quality-options";

describe("buildQualityOptions", () => {
  it("sorts levels from highest to lowest and preserves auto", () => {
    const options = buildQualityOptions([
      { height: 360, bitrate: 800000 } as never,
      { height: 1080, bitrate: 2800000 } as never,
      { height: 720, bitrate: 1400000 } as never,
    ]);

    expect(options).toEqual([
      { value: "AUTO", label: "Auto", height: null },
      { value: "1", label: "1080p", height: 1080 },
      { value: "2", label: "720p", height: 720 },
      { value: "0", label: "360p", height: 360 },
    ]);
  });

  it("drops malformed levels and deduplicates identical variants", () => {
    const options = buildQualityOptions([
      { height: 720, bitrate: 1500000 } as never,
      { height: 720, bitrate: 1500000 } as never,
      { height: 0, bitrate: 0 } as never,
      { bitrate: 900000 } as never,
    ]);

    expect(options).toEqual([
      { value: "AUTO", label: "Auto", height: null },
      { value: "0", label: "720p", height: 720 },
      { value: "3", label: "900 kbps", height: null },
    ]);
  });
});

describe("resolvePreferredQuality", () => {
  const options = [
    { value: "AUTO", label: "Auto", height: null },
    { value: "3", label: "1080p", height: 1080 },
    { value: "2", label: "720p", height: 720 },
    { value: "1", label: "360p", height: 360 },
  ];

  it("keeps automatic mode when auto is requested", () => {
    expect(resolvePreferredQuality("AUTO", options)).toEqual({
      mode: "AUTO",
      level: -1,
      selectedValue: "AUTO",
    });
  });

  it("resolves LOWEST to the lowest available manual level", () => {
    expect(resolvePreferredQuality("LOWEST", options)).toEqual({
      mode: "MANUAL",
      level: 1,
      selectedValue: "1",
    });
  });

  it("resolves HIGHEST to the highest available manual level", () => {
    expect(resolvePreferredQuality("HIGHEST", options)).toEqual({
      mode: "MANUAL",
      level: 3,
      selectedValue: "3",
    });
  });

  it("falls back to auto when a requested level no longer exists", () => {
    expect(resolvePreferredQuality("7", options)).toEqual({
      mode: "AUTO",
      level: -1,
      selectedValue: "AUTO",
    });
  });
});
