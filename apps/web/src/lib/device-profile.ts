export type DeviceClass = "mobile" | "tablet" | "desktop" | "tv";

export const DEFAULT_VIEWPORT_WIDTH = 1440;

export function getDeviceClass(viewportWidth: number): DeviceClass {
  if (viewportWidth < 768) {
    return "mobile";
  }

  if (viewportWidth < 1280) {
    return "tablet";
  }

  if (viewportWidth < 1600) {
    return "desktop";
  }

  return "tv";
}
