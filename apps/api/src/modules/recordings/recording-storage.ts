import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../../config/env.js";

const OUTPUT_CONTAINER = "mp4";
const RECORDING_MIME_TYPE = "video/mp4";
const MIN_PLAYABLE_RECORDING_BYTES = 1024;
const execFileAsync = promisify(execFile);

function sanitizePathSegment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, 64) || "recording";
}

function formatUtcDirectoryPart(value: number) {
  return String(value).padStart(2, "0");
}

function formatUtcTimestamp(date: Date) {
  return [
    date.getUTCFullYear(),
    formatUtcDirectoryPart(date.getUTCMonth() + 1),
    formatUtcDirectoryPart(date.getUTCDate()),
  ].join("") + `-${formatUtcDirectoryPart(date.getUTCHours())}${formatUtcDirectoryPart(date.getUTCMinutes())}${formatUtcDirectoryPart(date.getUTCSeconds())}Z`;
}

export function getRecordingContainerFormat() {
  return OUTPUT_CONTAINER;
}

export function getRecordingMimeType() {
  return RECORDING_MIME_TYPE;
}

export function buildRecordingStoragePath(params: {
  channelSlug: string;
  title: string;
  startAt: Date;
  recordingJobId: string;
}) {
  const year = String(params.startAt.getUTCFullYear());
  const month = formatUtcDirectoryPart(params.startAt.getUTCMonth() + 1);
  const day = formatUtcDirectoryPart(params.startAt.getUTCDate());
  const timestamp = formatUtcTimestamp(params.startAt);
  const channelSlug = sanitizePathSegment(params.channelSlug);
  const titleSlug = sanitizePathSegment(params.title);
  const jobSuffix = params.recordingJobId.slice(0, 8);
  const fileName = `${timestamp}-${channelSlug}-${titleSlug}-${jobSuffix}.${OUTPUT_CONTAINER}`;

  return {
    storagePath: path.posix.join(year, month, day, fileName),
    outputFileName: fileName,
    containerFormat: OUTPUT_CONTAINER,
  };
}

export function resolveRecordingAbsolutePath(storagePath: string) {
  const rootDirectory = path.resolve(env.RECORDINGS_STORAGE_DIR);
  const resolvedPath = path.resolve(rootDirectory, storagePath);
  const relativePath = path.relative(rootDirectory, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Recording storage path escapes configured storage root");
  }

  return resolvedPath;
}

export async function ensureRecordingStoragePath(storagePath: string) {
  const absolutePath = resolveRecordingAbsolutePath(storagePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

export async function readRecordingFileStats(storagePath: string) {
  const absolutePath = resolveRecordingAbsolutePath(storagePath);
  const stats = await fs.stat(absolutePath);

  return {
    absolutePath,
    sizeBytes: stats.size,
  };
}

export async function deleteRecordingFile(storagePath: string) {
  const absolutePath = resolveRecordingAbsolutePath(storagePath);
  await fs.rm(absolutePath, { force: true });
}

function parsePositiveDuration(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function formatRecordingFileSize(fileSizeBytes: number) {
  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`;
  }

  if (fileSizeBytes < 1024 * 1024) {
    return `${Math.round(fileSizeBytes / 1024)} KB`;
  }

  if (fileSizeBytes < 1024 * 1024 * 1024) {
    return `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function parseRecordingMediaProbe(stdout: string) {
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string | number | null };
    streams?: Array<{ codec_type?: string | null; duration?: string | number | null }>;
  };
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const mediaStreams = streams.filter((stream) => stream.codec_type === "video" || stream.codec_type === "audio");
  const hasVideo = mediaStreams.some((stream) => stream.codec_type === "video");
  const hasAudio = mediaStreams.some((stream) => stream.codec_type === "audio");
  const durationCandidates = [
    parsePositiveDuration(parsed.format?.duration),
    ...mediaStreams.map((stream) => parsePositiveDuration(stream.duration)),
  ].filter((value): value is number => value !== null);

  return {
    hasVideo,
    hasAudio,
    streamCount: mediaStreams.length,
    durationSeconds: durationCandidates.length ? Math.max(...durationCandidates) : null,
  };
}

export function isPlayableRecordingOutput(params: {
  fileSizeBytes: number;
  streamCount: number;
}) {
  return params.fileSizeBytes >= MIN_PLAYABLE_RECORDING_BYTES && params.streamCount > 0;
}

export async function inspectRecordingOutput(storagePath: string) {
  const { absolutePath, sizeBytes } = await readRecordingFileStats(storagePath);

  if (sizeBytes < MIN_PLAYABLE_RECORDING_BYTES) {
    return {
      absolutePath,
      fileSizeBytes: BigInt(sizeBytes),
      durationSeconds: null,
      isPlayable: false,
      validationReason: "Recording finished without playable media output",
    };
  }

  try {
    const { stdout } = await execFileAsync(env.RECORDINGS_FFPROBE_PATH, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "format=duration:stream=codec_type,duration",
      "-show_streams",
      absolutePath,
    ]);
    const probe = parseRecordingMediaProbe(stdout);

    if (!isPlayableRecordingOutput({ fileSizeBytes: sizeBytes, streamCount: probe.streamCount })) {
      return {
        absolutePath,
        fileSizeBytes: BigInt(sizeBytes),
        durationSeconds: null,
        isPlayable: false,
        validationReason: "Recording output did not contain playable audio or video streams",
      };
    }

    return {
      absolutePath,
      fileSizeBytes: BigInt(sizeBytes),
      durationSeconds: probe.durationSeconds,
      isPlayable: true,
      validationReason: null,
    };
  } catch {
    return {
      absolutePath,
      fileSizeBytes: BigInt(sizeBytes),
      durationSeconds: null,
      isPlayable: sizeBytes >= MIN_PLAYABLE_RECORDING_BYTES,
      validationReason:
        sizeBytes >= MIN_PLAYABLE_RECORDING_BYTES
          ? null
          : "Recording finished without playable media output",
    };
  }
}
