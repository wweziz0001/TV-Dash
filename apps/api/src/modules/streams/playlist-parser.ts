import { streamVariantSchema } from "@tv-dash/shared";

const MASTER_TAG = "#EXT-X-STREAM-INF";

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

    variants.push(
      streamVariantSchema.parse({
        label,
        height: Number.isNaN(height) ? null : height,
        bandwidth: Number.isNaN(bandwidth) ? null : bandwidth,
      }),
    );
  }

  return {
    variantCount: variants.length,
    variants,
    isMasterPlaylist: variants.length > 0,
  };
}
