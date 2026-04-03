import type { RecordingJobRecord } from "./recording.repository.js";
import { readRecordingFileStats } from "./recording-storage.js";

function mapFileSize(value: bigint | null | undefined) {
  if (typeof value !== "bigint") {
    return null;
  }

  return Number(value);
}

export async function resolveRecordingRunProgress(record: RecordingJobRecord) {
  const latestRun = record.runs[0] ?? null;

  if (!latestRun) {
    return null;
  }

  let fileSizeBytes = mapFileSize(latestRun.fileSizeBytes);
  let durationSeconds = latestRun.durationSeconds;

  if (record.status === "RECORDING") {
    const startedAt = latestRun.startedAt ?? record.actualStartAt;

    if (startedAt) {
      durationSeconds = Math.max(durationSeconds ?? 0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }

    try {
      const stats = await readRecordingFileStats(latestRun.storagePath);
      fileSizeBytes = stats.sizeBytes;
    } catch {
      fileSizeBytes = fileSizeBytes ?? 0;
    }
  }

  return {
    id: latestRun.id,
    status: latestRun.status,
    outputFileName: latestRun.outputFileName,
    containerFormat: latestRun.containerFormat,
    ffmpegPid: latestRun.ffmpegPid,
    startedAt: latestRun.startedAt?.toISOString() ?? null,
    endedAt: latestRun.endedAt?.toISOString() ?? null,
    exitCode: latestRun.exitCode,
    exitSignal: latestRun.exitSignal,
    failureReason: latestRun.failureReason,
    stderrTail: latestRun.stderrTail,
    fileSizeBytes,
    durationSeconds,
    createdAt: latestRun.createdAt.toISOString(),
    updatedAt: latestRun.updatedAt.toISOString(),
  };
}
