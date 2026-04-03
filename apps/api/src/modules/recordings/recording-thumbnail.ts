import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../../config/env.js";
import { ensureRecordingStoragePath, resolveRecordingAbsolutePath } from "./recording-storage.js";

const execFileAsync = promisify(execFile);
const RECORDING_THUMBNAIL_MIME_TYPE = "image/jpeg";

export function getRecordingThumbnailMimeType() {
  return RECORDING_THUMBNAIL_MIME_TYPE;
}

export function buildRecordingThumbnailPath(storagePath: string) {
  const parsed = path.posix.parse(storagePath);
  return path.posix.join(parsed.dir, `${parsed.name}.thumbnail.jpg`);
}

export function resolveRecordingThumbnailOffsetSeconds(durationSeconds: number | null) {
  if (!durationSeconds || durationSeconds <= 0) {
    return 15;
  }

  if (durationSeconds <= 8) {
    return 1;
  }

  return Math.max(1, Math.min(120, Math.round(durationSeconds * 0.2)));
}

export async function generateRecordingThumbnail(params: {
  storagePath: string;
  durationSeconds: number | null;
}) {
  const absoluteInputPath = resolveRecordingAbsolutePath(params.storagePath);
  const thumbnailPath = buildRecordingThumbnailPath(params.storagePath);
  const absoluteOutputPath = await ensureRecordingStoragePath(thumbnailPath);

  try {
    await execFileAsync(env.RECORDINGS_FFMPEG_PATH, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(resolveRecordingThumbnailOffsetSeconds(params.durationSeconds)),
      "-i",
      absoluteInputPath,
      "-frames:v",
      "1",
      "-vf",
      "thumbnail,scale=640:-2",
      "-q:v",
      "4",
      absoluteOutputPath,
    ]);

    const stats = await fs.stat(absoluteOutputPath);

    if (stats.size <= 0) {
      await fs.rm(absoluteOutputPath, { force: true });
      return null;
    }

    return {
      thumbnailPath,
      thumbnailMimeType: RECORDING_THUMBNAIL_MIME_TYPE,
      thumbnailGeneratedAt: new Date(),
    };
  } catch {
    await fs.rm(absoluteOutputPath, { force: true });
    return null;
  }
}
