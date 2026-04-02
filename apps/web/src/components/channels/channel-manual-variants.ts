export interface ManualVariantDraft {
  label: string;
  sortOrder: number;
  playlistUrl: string;
  width: string;
  height: string;
  bandwidth: string;
  codecs: string;
  isActive: boolean;
}

export interface ManualQualityProfile {
  label: string;
  aliases: string[];
  sortWeight: number;
  width: string;
  height: string;
  bandwidth: string;
}

const MANUAL_QUALITY_PROFILES: ManualQualityProfile[] = [
  {
    label: "240p",
    aliases: ["240"],
    sortWeight: 240,
    width: "426",
    height: "240",
    bandwidth: "400000",
  },
  {
    label: "360p",
    aliases: ["360"],
    sortWeight: 360,
    width: "640",
    height: "360",
    bandwidth: "800000",
  },
  {
    label: "480p",
    aliases: ["480"],
    sortWeight: 480,
    width: "854",
    height: "480",
    bandwidth: "1200000",
  },
  {
    label: "540p",
    aliases: ["540"],
    sortWeight: 540,
    width: "960",
    height: "540",
    bandwidth: "1800000",
  },
  {
    label: "720p",
    aliases: ["720", "hd"],
    sortWeight: 720,
    width: "1280",
    height: "720",
    bandwidth: "2800000",
  },
  {
    label: "1080p",
    aliases: ["1080", "fhd", "fullhd"],
    sortWeight: 1080,
    width: "1920",
    height: "1080",
    bandwidth: "5000000",
  },
  {
    label: "low",
    aliases: ["lo"],
    sortWeight: 260,
    width: "640",
    height: "360",
    bandwidth: "700000",
  },
  {
    label: "medium",
    aliases: ["med", "mid"],
    sortWeight: 560,
    width: "960",
    height: "540",
    bandwidth: "1800000",
  },
  {
    label: "high",
    aliases: ["hi"],
    sortWeight: 960,
    width: "1920",
    height: "1080",
    bandwidth: "4500000",
  },
];

const MANUAL_QUALITY_PROFILE_MAP = new Map<string, ManualQualityProfile>(
  MANUAL_QUALITY_PROFILES.flatMap((profile) => [
    [profile.label, profile],
    ...profile.aliases.map((alias) => [alias, profile] as const),
  ]),
);

export const MANUAL_VARIANT_LABEL_SUGGESTIONS = [
  "1080p",
  "720p",
  "540p",
  "480p",
  "360p",
  "240p",
  "low",
  "medium",
  "high",
];

export function getNextManualVariantSortOrder(variants: ManualVariantDraft[]) {
  return variants.reduce((highestValue, variant) => Math.max(highestValue, variant.sortOrder), -1) + 1;
}

export function normalizeManualVariantLabel(label: string) {
  const trimmedLabel = label.trim();

  if (!trimmedLabel) {
    return "";
  }

  const normalizedKey = trimmedLabel.toLowerCase().replace(/[\s_-]+/g, "");
  const numericMatch = normalizedKey.match(/^(\d{3,4})p?$/);

  if (numericMatch) {
    const numericProfile = MANUAL_QUALITY_PROFILE_MAP.get(numericMatch[1]);
    if (numericProfile) {
      return numericProfile.label;
    }
  }

  return MANUAL_QUALITY_PROFILE_MAP.get(normalizedKey)?.label ?? trimmedLabel;
}

export function findManualQualityProfile(label: string) {
  const normalizedLabel = normalizeManualVariantLabel(label);

  if (!normalizedLabel) {
    return null;
  }

  return MANUAL_QUALITY_PROFILE_MAP.get(normalizedLabel.toLowerCase().replace(/[\s_-]+/g, "")) ?? null;
}

export function inferManualVariantLabelFromUrl(playlistUrl: string) {
  const normalizedUrl = playlistUrl.trim().toLowerCase();

  if (!normalizedUrl) {
    return null;
  }

  const resolutionMatch = normalizedUrl.match(/(?:^|[^0-9])(1080|720|540|480|360|240)p?(?:[^0-9]|$)/);
  if (resolutionMatch?.[1]) {
    return `${resolutionMatch[1]}p`;
  }

  const keywordMatch = normalizedUrl.match(/(?:^|[^a-z])(low|medium|high)(?:[^a-z]|$)/);
  if (keywordMatch?.[1]) {
    return keywordMatch[1];
  }

  return null;
}

export function inferManualVariantLabelFromMetadata({
  width,
  height,
}: Pick<ManualVariantDraft, "width" | "height">) {
  const normalizedHeight = height.trim();
  const normalizedWidth = width.trim();

  if (normalizedHeight) {
    const heightProfile = findManualQualityProfile(normalizedHeight);
    if (heightProfile && heightProfile.label.endsWith("p")) {
      return heightProfile.label;
    }
  }

  if (normalizedWidth) {
    const widthProfile = MANUAL_QUALITY_PROFILES.find((profile) => profile.width === normalizedWidth);
    if (widthProfile) {
      return widthProfile.label;
    }
  }

  return null;
}

export function resolveManualVariantProfile(variant: ManualVariantDraft) {
  const normalizedLabel = normalizeManualVariantLabel(variant.label);
  const detectedLabel =
    normalizedLabel || inferManualVariantLabelFromUrl(variant.playlistUrl) || inferManualVariantLabelFromMetadata(variant);
  const profile = detectedLabel ? findManualQualityProfile(detectedLabel) : null;
  const inferredFrom = normalizedLabel
    ? "label"
    : inferManualVariantLabelFromUrl(variant.playlistUrl)
      ? "url"
      : inferManualVariantLabelFromMetadata(variant)
        ? "metadata"
        : null;

  return {
    detectedLabel,
    profile,
    inferredFrom,
  } as const;
}

export function applyManualVariantAssists(variant: ManualVariantDraft): ManualVariantDraft {
  const resolved = resolveManualVariantProfile(variant);

  return {
    ...variant,
    label: variant.label.trim() ? normalizeManualVariantLabel(variant.label) : resolved.detectedLabel ?? "",
    playlistUrl: variant.playlistUrl.trim(),
    width: variant.width.trim() || resolved.profile?.width || "",
    height: variant.height.trim() || resolved.profile?.height || "",
    bandwidth: variant.bandwidth.trim() || resolved.profile?.bandwidth || "",
    codecs: variant.codecs.trim(),
  };
}

export function createPresetManualVariant(label: string, sortOrder: number): ManualVariantDraft {
  const normalizedLabel = normalizeManualVariantLabel(label);
  const profile = findManualQualityProfile(normalizedLabel);

  return {
    label: normalizedLabel,
    sortOrder,
    playlistUrl: "",
    width: profile?.width ?? "",
    height: profile?.height ?? "",
    bandwidth: profile?.bandwidth ?? "",
    codecs: "",
    isActive: true,
  };
}

function buildDuplicateVariantLabel(label: string, variants: ManualVariantDraft[]) {
  const existingLabels = new Set(
    variants
      .map((variant) => normalizeManualVariantLabel(variant.label).toLowerCase())
      .filter(Boolean),
  );
  const baseLabel = normalizeManualVariantLabel(label) || "variant";
  const prefix = `${baseLabel} copy`;

  if (!existingLabels.has(prefix.toLowerCase())) {
    return prefix;
  }

  let copyIndex = 2;
  let candidate = `${prefix} ${copyIndex}`;

  while (existingLabels.has(candidate.toLowerCase())) {
    copyIndex += 1;
    candidate = `${prefix} ${copyIndex}`;
  }

  return candidate;
}

export function duplicateManualVariant(variant: ManualVariantDraft, variants: ManualVariantDraft[]): ManualVariantDraft {
  return {
    ...variant,
    label: buildDuplicateVariantLabel(variant.label, variants),
    sortOrder: getNextManualVariantSortOrder(variants),
    playlistUrl: "",
  };
}

export function addPresetManualVariants(variants: ManualVariantDraft[], labels: string[]) {
  const existingLabels = new Set(
    variants
      .map((variant) => normalizeManualVariantLabel(variant.label).toLowerCase())
      .filter(Boolean),
  );
  const nextVariants = [...variants];

  for (const label of labels) {
    const normalizedLabel = normalizeManualVariantLabel(label).toLowerCase();
    if (existingLabels.has(normalizedLabel)) {
      continue;
    }

    nextVariants.push(createPresetManualVariant(label, getNextManualVariantSortOrder(nextVariants)));
    existingLabels.add(normalizedLabel);
  }

  return nextVariants;
}

export function autoSortManualVariants(variants: ManualVariantDraft[]) {
  return [...variants]
    .map((variant, index) => {
      const assistedVariant = applyManualVariantAssists(variant);
      const resolved = resolveManualVariantProfile(assistedVariant);

      return {
        assistedVariant,
        index,
        sortWeight: resolved.profile?.sortWeight ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((left, right) => {
      if (left.sortWeight !== right.sortWeight) {
        return left.sortWeight - right.sortWeight;
      }

      if (left.assistedVariant.sortOrder !== right.assistedVariant.sortOrder) {
        return left.assistedVariant.sortOrder - right.assistedVariant.sortOrder;
      }

      return left.index - right.index;
    })
    .map(({ assistedVariant }, index) => ({
      ...assistedVariant,
      sortOrder: index,
    }));
}
