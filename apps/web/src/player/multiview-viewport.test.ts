import { describe, expect, it } from "vitest";
import {
  constrainMultiviewLayoutType,
  getMultiviewViewportPolicy,
  getSuggestedMultiviewLayoutType,
} from "./multiview-viewport";

describe("getMultiviewViewportPolicy", () => {
  it("limits mobile walls to focused layouts", () => {
    expect(getMultiviewViewportPolicy(430)).toEqual({
      deviceClass: "mobile",
      allowedLayoutTypes: ["LAYOUT_1X1", "LAYOUT_FOCUS_1_2"],
      maxTileCount: 3,
      operatorNote:
        "Phone mode keeps multi-view to focused 1- or 3-tile walls so playback and controls stay legible.",
    });
  });

  it("unlocks denser layouts on large-screen monitors", () => {
    expect(getMultiviewViewportPolicy(1920).allowedLayoutTypes).toEqual([
      "LAYOUT_1X1",
      "LAYOUT_2X2",
      "LAYOUT_3X3",
      "LAYOUT_FOCUS_1_2",
      "LAYOUT_FOCUS_1_4",
    ]);
  });
});

describe("getSuggestedMultiviewLayoutType", () => {
  it("suggests device-appropriate defaults for seeded channels", () => {
    expect(getSuggestedMultiviewLayoutType(390, 3)).toBe("LAYOUT_FOCUS_1_2");
    expect(getSuggestedMultiviewLayoutType(1024, 4)).toBe("LAYOUT_2X2");
    expect(getSuggestedMultiviewLayoutType(1440, 5)).toBe("LAYOUT_FOCUS_1_4");
    expect(getSuggestedMultiviewLayoutType(1920, 8)).toBe("LAYOUT_3X3");
  });
});

describe("constrainMultiviewLayoutType", () => {
  it("falls back when a saved or requested layout is too dense for the current viewport", () => {
    expect(constrainMultiviewLayoutType("LAYOUT_3X3", 768, 6)).toBe("LAYOUT_2X2");
    expect(constrainMultiviewLayoutType("LAYOUT_FOCUS_1_4", 430, 5)).toBe("LAYOUT_FOCUS_1_2");
  });

  it("keeps supported layouts unchanged", () => {
    expect(constrainMultiviewLayoutType("LAYOUT_2X2", 1366, 4)).toBe("LAYOUT_2X2");
  });
});
