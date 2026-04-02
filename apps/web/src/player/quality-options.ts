import type { Level } from "hls.js";
import type { QualityOption } from "@/types/api";

export const defaultQualityOptions = [{ value: "AUTO", label: "Auto", height: null }] satisfies QualityOption[];

interface NormalizedQualityOption extends QualityOption {
  bitrate: number | null;
}

function normalizePositiveNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value);
}

export function buildQualityOptions(levels: Level[]): QualityOption[] {
  const seen = new Set<string>();
  const mapped = levels.flatMap((level, index): NormalizedQualityOption[] => {
    const height = normalizePositiveNumber(level.height);
    const bitrate = normalizePositiveNumber(level.bitrate);
    const preferredLabel = typeof level.name === "string" && level.name.trim() ? level.name.trim() : null;

    if (height === null && bitrate === null && preferredLabel === null) {
      return [];
    }

    const label = preferredLabel ?? (height !== null ? `${height}p` : `${Math.round((bitrate ?? 0) / 1000)} kbps`);
    const dedupeKey = `${height ?? "unknown"}:${bitrate ?? "unknown"}:${label}`;

    if (seen.has(dedupeKey)) {
      return [];
    }

    seen.add(dedupeKey);

    return [
      {
        value: String(index),
        label,
        height,
        bitrate,
      },
    ];
  });

  mapped.sort((left, right) => {
    const leftHeight = left.height ?? 0;
    const rightHeight = right.height ?? 0;
    return rightHeight - leftHeight || (right.bitrate ?? 0) - (left.bitrate ?? 0);
  });

  return [
    ...defaultQualityOptions,
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

  if (requested === "HIGHEST") {
    const highest = options.find((option) => option.value !== "AUTO");
    return highest
      ? {
          mode: "MANUAL" as const,
          level: Number(highest.value),
          selectedValue: highest.value,
        }
      : {
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
