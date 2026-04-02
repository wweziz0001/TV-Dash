import type { Level } from "hls.js";
import type { QualityOption } from "@/types/api";

export function buildQualityOptions(levels: Level[]): QualityOption[] {
  const mapped = levels.map((level, index) => ({
    value: String(index),
    label: level.height ? `${level.height}p` : `${Math.round((level.bitrate ?? 0) / 1000)} kbps`,
    height: level.height ?? null,
    bitrate: level.bitrate ?? null,
  }));

  mapped.sort((left, right) => {
    const leftHeight = left.height ?? 0;
    const rightHeight = right.height ?? 0;
    return rightHeight - leftHeight || (right.bitrate ?? 0) - (left.bitrate ?? 0);
  });

  return [
    { value: "AUTO", label: "Auto", height: null },
    ...mapped.map((option) => ({
      value: option.value,
      label: option.label,
      height: option.height,
    })),
  ];
}

export function resolvePreferredQuality(requested: string | null | undefined, options: QualityOption[]) {
  if (options.length <= 1 || !requested || requested === "AUTO") {
    return {
      mode: "AUTO" as const,
      level: -1,
      selectedValue: "AUTO",
    };
  }

  if (requested === "LOWEST") {
    const lowest = [...options].filter((option) => option.value !== "AUTO").at(-1);
    return lowest
      ? {
          mode: "MANUAL" as const,
          level: Number(lowest.value),
          selectedValue: lowest.value,
        }
      : {
          mode: "AUTO" as const,
          level: -1,
          selectedValue: "AUTO",
        };
  }

  const option = options.find((entry) => entry.value === requested);
  return option
    ? {
        mode: "MANUAL" as const,
        level: Number(option.value),
        selectedValue: option.value,
      }
    : {
        mode: "AUTO" as const,
        level: -1,
        selectedValue: "AUTO",
      };
}
