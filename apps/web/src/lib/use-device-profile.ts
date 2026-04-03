import { useEffect, useState } from "react";
import { DEFAULT_VIEWPORT_WIDTH, getDeviceClass, type DeviceClass } from "./device-profile";

interface DeviceProfile {
  viewportWidth: number;
  deviceClass: DeviceClass;
  isCoarsePointer: boolean;
}

function readDeviceProfile(): DeviceProfile {
  if (typeof window === "undefined") {
    return {
      viewportWidth: DEFAULT_VIEWPORT_WIDTH,
      deviceClass: getDeviceClass(DEFAULT_VIEWPORT_WIDTH),
      isCoarsePointer: false,
    };
  }

  const viewportWidth = window.innerWidth;

  return {
    viewportWidth,
    deviceClass: getDeviceClass(viewportWidth),
    isCoarsePointer: window.matchMedia("(pointer: coarse)").matches,
  };
}

export function useDeviceProfile() {
  const [profile, setProfile] = useState<DeviceProfile>(() => readDeviceProfile());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");

    function updateProfile() {
      setProfile(readDeviceProfile());
    }

    updateProfile();
    window.addEventListener("resize", updateProfile);
    coarsePointerQuery.addEventListener("change", updateProfile);

    return () => {
      window.removeEventListener("resize", updateProfile);
      coarsePointerQuery.removeEventListener("change", updateProfile);
    };
  }, []);

  return profile;
}
