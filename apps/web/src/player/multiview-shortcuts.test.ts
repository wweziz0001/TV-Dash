import { describe, expect, it } from "vitest";
import { getLayoutTypeForShortcut, getWrappedTileIndex } from "./multiview-shortcuts";

describe("getWrappedTileIndex", () => {
  it("wraps focus movement across the multiview wall", () => {
    expect(getWrappedTileIndex(0, -1, 4)).toBe(3);
    expect(getWrappedTileIndex(3, 1, 4)).toBe(0);
    expect(getWrappedTileIndex(1, 1, 4)).toBe(2);
  });
});

describe("getLayoutTypeForShortcut", () => {
  it("maps shift-number shortcuts to the supported layouts", () => {
    expect(getLayoutTypeForShortcut("1")).toBe("LAYOUT_1X1");
    expect(getLayoutTypeForShortcut("4")).toBe("LAYOUT_FOCUS_1_2");
    expect(getLayoutTypeForShortcut("9")).toBeNull();
  });
});
