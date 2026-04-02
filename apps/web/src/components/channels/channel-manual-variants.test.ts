import { describe, expect, it } from "vitest";
import {
  addPresetManualVariants,
  applyManualVariantAssists,
  autoSortManualVariants,
  inferManualVariantLabelFromMetadata,
  inferManualVariantLabelFromUrl,
  normalizeManualVariantLabel,
} from "./channel-manual-variants";

describe("channel manual variants helpers", () => {
  it("normalizes common labels and detects quality from URL or metadata", () => {
    expect(normalizeManualVariantLabel(" FULL HD ")).toBe("1080p");
    expect(normalizeManualVariantLabel("720")).toBe("720p");
    expect(inferManualVariantLabelFromUrl("https://example.com/live/high/playlist.m3u8")).toBe("high");
    expect(inferManualVariantLabelFromUrl("https://example.com/live/540/index.m3u8")).toBe("540p");
    expect(inferManualVariantLabelFromMetadata({ width: "", height: "720" })).toBe("720p");
  });

  it("applies safe defaults, avoids duplicate presets, and sorts known qualities low to high", () => {
    const initialVariants = [
      {
        label: "",
        sortOrder: 0,
        playlistUrl: "https://example.com/live/360/index.m3u8",
        width: "",
        height: "",
        bandwidth: "",
        codecs: "",
        isActive: true,
      },
      {
        label: "high",
        sortOrder: 4,
        playlistUrl: "https://example.com/live/high/index.m3u8",
        width: "",
        height: "",
        bandwidth: "",
        codecs: "",
        isActive: true,
      },
    ];

    const assistedVariant = applyManualVariantAssists(initialVariants[0]);
    const variantsWithPresets = addPresetManualVariants([...initialVariants], ["low", "medium", "high"]);
    const sortedVariants = autoSortManualVariants(variantsWithPresets);

    expect(assistedVariant.label).toBe("360p");
    expect(assistedVariant.bandwidth).toBe("800000");
    expect(variantsWithPresets.map((variant) => variant.label)).toEqual(["", "high", "low", "medium"]);
    expect(sortedVariants.map((variant) => variant.label).slice(0, 4)).toEqual(["low", "360p", "medium", "high"]);
    expect(sortedVariants.map((variant) => variant.sortOrder).slice(0, 4)).toEqual([0, 1, 2, 3]);
  });
});
