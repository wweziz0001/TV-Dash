import "@testing-library/jest-dom/vitest";

Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value: () => undefined,
});

Object.defineProperty(HTMLMediaElement.prototype, "load", {
  configurable: true,
  value: () => undefined,
});
