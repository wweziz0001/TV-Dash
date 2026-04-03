import type { LayoutType } from "@tv-dash/shared";
import { getDeviceClass, type DeviceClass } from "@/lib/device-profile";

const MOBILE_LAYOUTS: LayoutType[] = ["LAYOUT_1X1", "LAYOUT_FOCUS_1_2"];
const TABLET_LAYOUTS: LayoutType[] = ["LAYOUT_1X1", "LAYOUT_2X2", "LAYOUT_FOCUS_1_2"];
const DESKTOP_LAYOUTS: LayoutType[] = ["LAYOUT_1X1", "LAYOUT_2X2", "LAYOUT_FOCUS_1_2", "LAYOUT_FOCUS_1_4"];
const TV_LAYOUTS: LayoutType[] = ["LAYOUT_1X1", "LAYOUT_2X2", "LAYOUT_3X3", "LAYOUT_FOCUS_1_2", "LAYOUT_FOCUS_1_4"];

export interface MultiviewViewportPolicy {
  deviceClass: DeviceClass;
  allowedLayoutTypes: LayoutType[];
  maxTileCount: number;
  operatorNote: string;
}

export function getMultiviewViewportPolicy(viewportWidth: number): MultiviewViewportPolicy {
  const deviceClass = getDeviceClass(viewportWidth);

  if (deviceClass === "mobile") {
    return {
      deviceClass,
      allowedLayoutTypes: MOBILE_LAYOUTS,
      maxTileCount: 3,
      operatorNote: "Phone mode keeps multi-view to focused 1- or 3-tile walls so playback and controls stay legible.",
    };
  }

  if (deviceClass === "tablet") {
    return {
      deviceClass,
      allowedLayoutTypes: TABLET_LAYOUTS,
      maxTileCount: 4,
      operatorNote: "Tablet mode supports up to 4 tiles and prioritizes clear touch targets over dense monitor walls.",
    };
  }

  if (deviceClass === "desktop") {
    return {
      deviceClass,
      allowedLayoutTypes: DESKTOP_LAYOUTS,
      maxTileCount: 5,
      operatorNote: "Desktop mode keeps the operator wall compact while still allowing focused and 5-tile monitoring layouts.",
    };
  }

  return {
    deviceClass,
    allowedLayoutTypes: TV_LAYOUTS,
    maxTileCount: 9,
    operatorNote: "Large-screen mode unlocks the full wall set, including 9-up monitoring, with larger tile targets and status visibility.",
  };
}

export function getSuggestedMultiviewLayoutType(viewportWidth: number, activeChannelCount: number): LayoutType {
  const policy = getMultiviewViewportPolicy(viewportWidth);

  if (policy.deviceClass === "mobile") {
    return activeChannelCount > 1 ? "LAYOUT_FOCUS_1_2" : "LAYOUT_1X1";
  }

  if (policy.deviceClass === "tablet") {
    if (activeChannelCount >= 4) {
      return "LAYOUT_2X2";
    }

    return activeChannelCount >= 3 ? "LAYOUT_FOCUS_1_2" : "LAYOUT_1X1";
  }

  if (policy.deviceClass === "desktop") {
    if (activeChannelCount >= 5) {
      return "LAYOUT_FOCUS_1_4";
    }

    if (activeChannelCount >= 4) {
      return "LAYOUT_2X2";
    }

    return activeChannelCount >= 3 ? "LAYOUT_FOCUS_1_2" : "LAYOUT_1X1";
  }

  if (activeChannelCount >= 7) {
    return "LAYOUT_3X3";
  }

  if (activeChannelCount >= 5) {
    return "LAYOUT_FOCUS_1_4";
  }

  if (activeChannelCount >= 4) {
    return "LAYOUT_2X2";
  }

  return activeChannelCount >= 3 ? "LAYOUT_FOCUS_1_2" : "LAYOUT_1X1";
}

export function constrainMultiviewLayoutType(
  requestedLayoutType: LayoutType,
  viewportWidth: number,
  activeChannelCount: number,
) {
  const policy = getMultiviewViewportPolicy(viewportWidth);

  if (policy.allowedLayoutTypes.includes(requestedLayoutType)) {
    return requestedLayoutType;
  }

  return getSuggestedMultiviewLayoutType(viewportWidth, activeChannelCount);
}
