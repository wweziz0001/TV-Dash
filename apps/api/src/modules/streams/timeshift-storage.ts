import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";

function sanitizePathSegment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, 64) || "segment";
}

function resolveTimeshiftRoot() {
  return path.resolve(env.TIMESHIFT_STORAGE_DIR);
}

export function resolveTimeshiftAbsolutePath(storagePath: string) {
  const rootDirectory = resolveTimeshiftRoot();
  const resolvedPath = path.resolve(rootDirectory, storagePath);
  const relativePath = path.relative(rootDirectory, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Timeshift storage path escapes configured storage root");
  }

  return resolvedPath;
}

export async function ensureTimeshiftStoragePath(storagePath: string) {
  const absolutePath = resolveTimeshiftAbsolutePath(storagePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

export async function writeTimeshiftAsset(storagePath: string, data: Buffer) {
  const absolutePath = await ensureTimeshiftStoragePath(storagePath);
  await fs.writeFile(absolutePath, data);
  return absolutePath;
}

export async function readTimeshiftAsset(storagePath: string) {
  const absolutePath = resolveTimeshiftAbsolutePath(storagePath);
  return fs.readFile(absolutePath);
}

export async function deleteTimeshiftAsset(storagePath: string) {
  const absolutePath = resolveTimeshiftAbsolutePath(storagePath);
  await fs.rm(absolutePath, { force: true });
}

function getFileExtensionFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const extension = path.posix.extname(pathname);
    return extension && extension.length <= 10 ? extension : ".bin";
  } catch {
    return ".bin";
  }
}

export function buildTimeshiftStoragePath(params: {
  channelSlug: string;
  variantKey: string;
  assetId: string;
  sourceUrl: string;
}) {
  const extension = getFileExtensionFromUrl(params.sourceUrl);

  return path.posix.join(
    sanitizePathSegment(params.channelSlug),
    sanitizePathSegment(params.variantKey),
    `${sanitizePathSegment(params.assetId)}${extension}`,
  );
}
