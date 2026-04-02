import { parseMasterPlaylist } from "./playlist-parser.js";

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
    const parsed = parseMasterPlaylist(text);

    return {
      ok: true,
      contentType: response.headers.get("content-type"),
      variantCount: parsed.variantCount,
      variants: parsed.variants,
      isMasterPlaylist: parsed.isMasterPlaylist,
    };
  } finally {
    clearTimeout(timeout);
  }
}
