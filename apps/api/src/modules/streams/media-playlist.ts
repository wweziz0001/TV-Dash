const HEADER_TAG_PREFIXES = [
  "#EXT-X-VERSION",
  "#EXT-X-TARGETDURATION",
  "#EXT-X-PLAYLIST-TYPE",
  "#EXT-X-INDEPENDENT-SEGMENTS",
  "#EXT-X-SERVER-CONTROL",
  "#EXT-X-START",
  "#EXT-X-PART-INF",
  "#EXT-X-SKIP",
  "#EXT-X-PRELOAD-HINT",
];

export interface ParsedMediaPlaylistSegment {
  sequence: number;
  durationSeconds: number;
  title: string | null;
  absoluteUrl: string;
  tagLines: string[];
  programDateTime: string | null;
}

export interface ParsedMediaPlaylist {
  headerLines: string[];
  targetDurationSeconds: number;
  version: number | null;
  mediaSequence: number;
  playlistType: string | null;
  hasIndependentSegments: boolean;
  segments: ParsedMediaPlaylistSegment[];
}

function resolveUri(uri: string, baseUrl: string) {
  return new URL(uri, baseUrl).toString();
}

function parseNumberTag(line: string, prefix: string) {
  const value = Number.parseFloat(line.slice(prefix.length));
  return Number.isFinite(value) ? value : null;
}

function parseIntegerTag(line: string, prefix: string) {
  const value = Number.parseInt(line.slice(prefix.length), 10);
  return Number.isFinite(value) ? value : null;
}

export function parseMediaPlaylist(text: string, baseUrl: string): ParsedMediaPlaylist {
  const lines = text.split(/\r?\n/).map((line) => line.trim());

  if (!lines.includes("#EXTM3U")) {
    throw new Error("Invalid HLS media playlist response");
  }

  const headerLines = ["#EXTM3U"];
  const segments: ParsedMediaPlaylistSegment[] = [];
  let targetDurationSeconds = 6;
  let version: number | null = null;
  let mediaSequence = 0;
  let playlistType: string | null = null;
  let hasIndependentSegments = false;
  let pendingTagLines: string[] = [];
  let pendingDurationSeconds: number | null = null;
  let pendingTitle: string | null = null;
  let pendingProgramDateTime: string | null = null;

  lines.forEach((line) => {
    if (!line || line === "#EXTM3U" || line === "#EXT-X-ENDLIST") {
      return;
    }

    if (line.startsWith("#EXTINF:")) {
      const durationPayload = line.slice("#EXTINF:".length);
      const [durationValue, titleValue] = durationPayload.split(",", 2);
      const parsedDuration = Number.parseFloat(durationValue ?? "");

      pendingDurationSeconds = Number.isFinite(parsedDuration) ? parsedDuration : 0;
      pendingTitle = titleValue?.trim() ? titleValue.trim() : null;
      pendingTagLines.push(line);
      return;
    }

    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      mediaSequence = parseIntegerTag(line, "#EXT-X-MEDIA-SEQUENCE:") ?? 0;
      return;
    }

    if (line.startsWith("#EXT-X-TARGETDURATION:")) {
      targetDurationSeconds = parseIntegerTag(line, "#EXT-X-TARGETDURATION:") ?? targetDurationSeconds;
      headerLines.push(line);
      return;
    }

    if (line.startsWith("#EXT-X-VERSION:")) {
      version = parseIntegerTag(line, "#EXT-X-VERSION:");
      headerLines.push(line);
      return;
    }

    if (line.startsWith("#EXT-X-PLAYLIST-TYPE:")) {
      playlistType = line.slice("#EXT-X-PLAYLIST-TYPE:".length).trim() || null;
      headerLines.push(line);
      return;
    }

    if (line === "#EXT-X-INDEPENDENT-SEGMENTS") {
      hasIndependentSegments = true;
      headerLines.push(line);
      return;
    }

    if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      pendingProgramDateTime = line.slice("#EXT-X-PROGRAM-DATE-TIME:".length).trim() || null;
      pendingTagLines.push(line);
      return;
    }

    if (line.startsWith("#")) {
      if (HEADER_TAG_PREFIXES.some((prefix) => line.startsWith(prefix))) {
        headerLines.push(line);
        return;
      }

      pendingTagLines.push(line);
      return;
    }

    const durationSeconds = pendingDurationSeconds ?? 0;
    const sequence = mediaSequence + segments.length;

    segments.push({
      sequence,
      durationSeconds,
      title: pendingTitle,
      absoluteUrl: resolveUri(line, baseUrl),
      tagLines: pendingTagLines,
      programDateTime: pendingProgramDateTime,
    });

    pendingTagLines = [];
    pendingDurationSeconds = null;
    pendingTitle = null;
    pendingProgramDateTime = null;
  });

  return {
    headerLines,
    targetDurationSeconds,
    version,
    mediaSequence,
    playlistType,
    hasIndependentSegments,
    segments,
  };
}

export function sumSegmentDurations(segments: Array<Pick<ParsedMediaPlaylistSegment, "durationSeconds">>) {
  return segments.reduce((total, segment) => total + segment.durationSeconds, 0);
}
