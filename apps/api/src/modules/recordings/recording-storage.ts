import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";

const OUTPUT_CONTAINER = "mp4";
const RECORDING_MIME_TYPE = "video/mp4";

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
