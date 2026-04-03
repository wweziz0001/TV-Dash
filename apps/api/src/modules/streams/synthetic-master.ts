interface SyntheticMasterVariant {
  label: string;
  sortOrder: number;
  playlistUrl: string;
  width: number | null;
  height: number | null;
  bandwidth: number | null;
  codecs: string | null;
}

interface ResolvedVariantMetadata {
  bandwidth: number;
  width: number | null;
  height: number | null;
  codecs: string | null;
}

const FALLBACK_HEIGHTS = [360, 540, 720, 1080, 1440, 2160];
const HEIGHT_BANDWIDTH_MAP = new Map<number, number>([
  [240, 400_000],
  [360, 800_000],
  [480, 1_200_000],
  [540, 1_600_000],
  [720, 2_800_000],
  [1080, 5_000_000],
  [1440, 8_000_000],
  [2160, 14_000_000],
]);
const HEIGHT_WIDTH_MAP = new Map<number, number>([
  [240, 426],
  [360, 640],
  [480, 854],
  [540, 960],
  [720, 1280],
  [1080, 1920],
  [1440, 2560],
  [2160, 3840],
]);
const QUALITY_LABEL_METADATA = new Map<
  string,
  {
    height: number;
    bandwidth: number;
  }
>([
  ["low", { height: 360, bandwidth: 800_000 }],
  ["sd", { height: 480, bandwidth: 1_200_000 }],
  ["medium", { height: 540, bandwidth: 1_600_000 }],
  ["high", { height: 720, bandwidth: 2_800_000 }],
  ["hd", { height: 720, bandwidth: 2_800_000 }],
  ["fullhd", { height: 1080, bandwidth: 5_000_000 }],
  ["full-hd", { height: 1080, bandwidth: 5_000_000 }],
  ["fhd", { height: 1080, bandwidth: 5_000_000 }],
  ["uhd", { height: 2160, bandwidth: 14_000_000 }],
  ["4k", { height: 2160, bandwidth: 14_000_000 }],
]);

function parseHeightFromLabel(label: string) {
  const normalizedLabel = label.trim().toLowerCase().replace(/\s+/g, "");
  const keywordMatch = QUALITY_LABEL_METADATA.get(normalizedLabel);

  if (keywordMatch) {
    return keywordMatch.height;
  }

  const resolutionMatch = normalizedLabel.match(/(\d{3,4})p/);
  if (!resolutionMatch) {
    return null;
  }

  const height = Number.parseInt(resolutionMatch[1] ?? "", 10);
  return Number.isFinite(height) ? height : null;
}

function parseBandwidthFromLabel(label: string) {
  const normalizedLabel = label.trim().toLowerCase().replace(/\s+/g, "");
  const keywordMatch = QUALITY_LABEL_METADATA.get(normalizedLabel);

  if (keywordMatch) {
    return keywordMatch.bandwidth;
  }

  const kbpsMatch = normalizedLabel.match(/(\d{3,6})kbps/);
  if (!kbpsMatch) {
    return null;
  }

  const bandwidth = Number.parseInt(kbpsMatch[1] ?? "", 10) * 1_000;
  return Number.isFinite(bandwidth) ? bandwidth : null;
}

function deriveWidth(height: number | null, width: number | null) {
  if (width) {
    return width;
  }

  if (!height) {
    return null;
  }

  return HEIGHT_WIDTH_MAP.get(height) ?? Math.max(16, Math.round((height * 16) / 9));
}

function deriveFallbackBandwidth(index: number) {
  const fallbackHeight = FALLBACK_HEIGHTS[Math.min(index, FALLBACK_HEIGHTS.length - 1)] ?? 720;
  return HEIGHT_BANDWIDTH_MAP.get(fallbackHeight) ?? 2_800_000;
}

function escapeAttributeValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function resolveVariantMetadata(variant: SyntheticMasterVariant, index: number): ResolvedVariantMetadata {
  const derivedHeight = variant.height ?? parseHeightFromLabel(variant.label);
  const derivedBandwidth =
    variant.bandwidth ?? (derivedHeight ? HEIGHT_BANDWIDTH_MAP.get(derivedHeight) ?? null : null) ?? parseBandwidthFromLabel(variant.label);

  return {
    bandwidth: derivedBandwidth ?? deriveFallbackBandwidth(index),
    width: deriveWidth(derivedHeight, variant.width),
    height: derivedHeight,
    codecs: variant.codecs,
  };
}

export function buildSyntheticMasterPlaylist(
  variants: SyntheticMasterVariant[],
  options: { rewriteUri?: (absoluteUrl: string) => string } = {},
) {
  const orderedVariants = [...variants].sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));

  if (!orderedVariants.length) {
    throw new Error("Synthetic master playlist could not be generated because no active variants are available");
  }

  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];

  orderedVariants.forEach((variant, index) => {
    const metadata = resolveVariantMetadata(variant, index);
    const attributes = [`BANDWIDTH=${metadata.bandwidth}`, `NAME="${escapeAttributeValue(variant.label)}"`];

    if (metadata.width && metadata.height) {
      attributes.push(`RESOLUTION=${metadata.width}x${metadata.height}`);
    }

    if (metadata.codecs) {
      attributes.push(`CODECS="${escapeAttributeValue(metadata.codecs)}"`);
    }

    lines.push(`#EXT-X-STREAM-INF:${attributes.join(",")}`);
    lines.push(options.rewriteUri ? options.rewriteUri(variant.playlistUrl) : variant.playlistUrl);
  });

  return `${lines.join("\n")}\n`;
}
