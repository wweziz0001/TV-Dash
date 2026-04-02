import { streamVariantSchema } from "@tv-dash/shared";

const MASTER_TAG = "#EXT-X-STREAM-INF";

function absolutizePlaylistUrl(sourceUrl: string, maybeRelative: string) {
  try {
    return new URL(maybeRelative, sourceUrl).toString();
  } catch {
    return maybeRelative;
  }
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

export async function inspectStream(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "TV-Dash/0.1",
      },
    });

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split(/\r?\n/).map((line) => line.trim());
    const variants = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.startsWith(MASTER_TAG)) {
        continue;
      }

      const attrs = parseAttributes(line);
      const nextLine = lines[index + 1] ?? "";
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

      if (nextLine && !nextLine.startsWith("#")) {
        absolutizePlaylistUrl(url, nextLine);
      }
    }

    return {
      ok: true,
      contentType: response.headers.get("content-type"),
      variantCount: variants.length,
      variants,
      isMasterPlaylist: variants.length > 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

