import { describe, expect, it } from "vitest";
import {
  clampFloatingPlayerLayout,
  getDefaultFloatingPlayerLayout,
} from "./floating-player";

describe("floating-player", () => {
  it("creates staggered default layouts inside the viewport", () => {
    const first = getDefaultFloatingPlayerLayout(0, 1280, 720);
    const second = getDefaultFloatingPlayerLayout(1, 1280, 720);

    expect(first).toMatchObject({
      width: 420,
      height: 236,
    });
    expect(second.left).toBeLessThan(first.left);
    expect(second.top).toBeGreaterThan(first.top);
  });

  it("clamps floating layouts so drag and resize cannot leave the viewport", () => {
    expect(
      clampFloatingPlayerLayout(
        {
          left: -120,
          top: -80,
          width: 960,
          height: 720,
          zIndex: 99,
        },
        640,
        360,
      ),
    ).toMatchObject({
      left: 24,
      top: 24,
      width: 592,
      height: 312,
      zIndex: 99,
    });
  });
});
