const URI_ATTRIBUTE_PATTERN = /URI="([^"]+)"/g;

export function resolveUri(uri: string, baseUrl: string) {
  try {
    return new URL(uri, baseUrl).toString();
  } catch {
    return null;
  }
}

export function rewriteAttributeUris(line: string, baseUrl: string, rewriteUri: (absoluteUrl: string) => string) {
  return line.replace(URI_ATTRIBUTE_PATTERN, (_, uri: string) => {
    const absoluteUrl = resolveUri(uri, baseUrl);
    return absoluteUrl ? `URI="${rewriteUri(absoluteUrl)}"` : `URI="${uri}"`;
  });
}

export function isPlaylistResponse(contentType: string | null, url: string) {
  return Boolean(
    contentType?.includes("application/vnd.apple.mpegurl") ||
      contentType?.includes("application/x-mpegURL") ||
      url.toLowerCase().includes(".m3u8"),
  );
}

export function rewritePlaylist(
  text: string,
  baseUrl: string,
  rewriteUri: (absoluteUrl: string) => string,
) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        return line;
      }

      if (trimmedLine.startsWith("#")) {
        return rewriteAttributeUris(line, baseUrl, rewriteUri);
      }

      const absoluteUrl = resolveUri(trimmedLine, baseUrl);
      return absoluteUrl ? rewriteUri(absoluteUrl) : line;
    })
    .join("\n");
}
