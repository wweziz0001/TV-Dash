import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../../config/env.js";

const execFileAsync = promisify(execFile);
const EXEC_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

export interface RecordingFfmpegCapabilities {
  configuredPath: string;
  binaryPath: string;
  version: string | null;
  supportsAllowedSegmentExtensions: boolean;
  supportsExtensionPicky: boolean;
}

let ffmpegCapabilitiesPromise: Promise<RecordingFfmpegCapabilities> | null = null;

function firstNonEmptyLine(text: string) {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

export function parseFfmpegVersion(output: string) {
  return firstNonEmptyLine(output);
}

export function supportsFfmpegOption(helpOutput: string, optionName: string) {
  const escapedOptionName = optionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)-${escapedOptionName}(\\s|$)`, "m").test(helpOutput);
}

async function resolveExecutablePath(configuredPath: string) {
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  if (configuredPath.includes(path.sep) || configuredPath.startsWith(".")) {
    return path.resolve(configuredPath);
  }

  const locatorCommand = process.platform === "win32" ? "where" : "which";

  try {
    const { stdout } = await execFileAsync(locatorCommand, [configuredPath], {
      maxBuffer: EXEC_MAX_BUFFER_BYTES,
    });
    return firstNonEmptyLine(stdout) ?? configuredPath;
  } catch {
    return configuredPath;
  }
}

async function detectRecordingFfmpegCapabilities(): Promise<RecordingFfmpegCapabilities> {
  const configuredPath = env.RECORDINGS_FFMPEG_PATH;
  const binaryPath = await resolveExecutablePath(configuredPath);

  try {
    const [{ stdout: versionStdout, stderr: versionStderr }, { stdout: helpStdout, stderr: helpStderr }] =
      await Promise.all([
        execFileAsync(binaryPath, ["-version"], { maxBuffer: EXEC_MAX_BUFFER_BYTES }),
        execFileAsync(binaryPath, ["-hide_banner", "-h", "full"], { maxBuffer: EXEC_MAX_BUFFER_BYTES }),
      ]);

    return {
      configuredPath,
      binaryPath,
      version: parseFfmpegVersion(`${versionStdout}\n${versionStderr}`),
      supportsAllowedSegmentExtensions: supportsFfmpegOption(
        `${helpStdout}\n${helpStderr}`,
        "allowed_segment_extensions",
      ),
      supportsExtensionPicky: supportsFfmpegOption(`${helpStdout}\n${helpStderr}`, "extension_picky"),
    };
  } catch {
    return {
      configuredPath,
      binaryPath,
      version: null,
      supportsAllowedSegmentExtensions: false,
      supportsExtensionPicky: false,
    };
  }
}

export function getRecordingFfmpegCapabilities() {
  ffmpegCapabilitiesPromise ??= detectRecordingFfmpegCapabilities();
  return ffmpegCapabilitiesPromise;
}

export function clearRecordingFfmpegCapabilitiesCacheForTests() {
  ffmpegCapabilitiesPromise = null;
}
