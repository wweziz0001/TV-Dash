import { streamVariantSchema } from "@tv-dash/shared";

const MASTER_TAG = "#EXT-X-STREAM-INF";

export interface ParsedMasterPlaylistVariantEntry {
  index: number;
  uri: string;
  label: string;
  height: number | null;
  bandwidth: number | null;
  audioGroupId: string | null;
  streamInfLine: string;
}

function parseAttributes(line: string) {
  const attributeString = line.slice(MASTER_TAG.length + 1);
  const attributes = new Map<string, string>();

  for (const part of attributeString.split(",")) {
    const [key, value] = part.split("=");
    if (key && value) {
      attributes.set(key.trim(), value.replaceAll('"', "").trim());
    }
  }

  return attributes;
}

export function parseMasterPlaylist(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const isHlsPlaylist = lines.includes("#EXTM3U");

  if (!isHlsPlaylist) {
    throw new Error("Invalid HLS playlist response");
  }

  const variants = [];
  const variantEntries: ParsedMasterPlaylistVariantEntry[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(MASTER_TAG)) {
      continue;
    }

    const attrs = parseAttributes(line);
    const heightValue = attrs.get("RESOLUTION")?.split("x")[1] ?? null;
    const height = heightValue ? Number.parseInt(heightValue, 10) : null;
    const bandwidth = attrs.get("BANDWIDTH")
      ? Number.parseInt(attrs.get("BANDWIDTH") ?? "", 10)
      : null;
    const label = height ? `${height}p` : bandwidth ? `${Math.round(bandwidth / 1000)} kbps` : "Variant";
    const uri = lines
      .slice(index + 1)
      .find((candidateLine) => candidateLine && !candidateLine.startsWith("#"));

    if (!uri) {
      continue;
    }

    variants.push(
      streamVariantSchema.parse({
        label,
        height: Number.isNaN(height) ? null : height,
        bandwidth: Number.isNaN(bandwidth) ? null : bandwidth,
      }),
    );

    variantEntries.push({
      index: variantEntries.length,
      uri,
      label,
      height: Number.isNaN(height) ? null : height,
      bandwidth: Number.isNaN(bandwidth) ? null : bandwidth,
      audioGroupId: attrs.get("AUDIO") ?? null,
      streamInfLine: line,
    });
  }

  return {
    variantCount: variants.length,
    variants,
    variantEntries,
    isMasterPlaylist: variants.length > 0,
  };
}
