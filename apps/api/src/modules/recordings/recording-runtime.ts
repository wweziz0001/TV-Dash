import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { writeStructuredLog } from "../../app/structured-log.js";
import {
  claimRecordingJobStart,
  failRecordingJobBeforeStart,
  finalizeRecordingRun,
  findRecordingRuntimeJobById,
  listDueRecordingJobs,
  markInterruptedRecordingRunsFailed,
  markRecordingRunStarted,
  type RecordingRuntimeJobRecord,
} from "./recording.repository.js";
import {
  buildRecordingStoragePath,
  ensureRecordingStoragePath,
  getRecordingContainerFormat,
  readRecordingFileStats,
  resolveRecordingAbsolutePath,
} from "./recording-storage.js";

interface StopRecordingOptions {
  reason: string;
  kind?: "manual" | "scheduled" | "shutdown";
  waitForExit?: boolean;
}

interface ActiveRecordingProcess {
  recordingJobId: string;
  recordingRunId: string;
  storagePath: string;
  endAt: Date | null;
  startedAt: Date;
  childProcess: ReturnType<typeof spawn>;
  stderrLines: string[];
  stopKind: "manual" | "scheduled" | "shutdown" | null;
  stopReason: string | null;
  isFinalized: boolean;
  stopPromise: Promise<void>;
  resolveStopPromise: () => void;
}

const activeRecordingProcesses = new Map<string, ActiveRecordingProcess>();
const MAX_STDERR_LINES = 30;
const STOP_WAIT_TIMEOUT_MS = 15_000;
const STOP_KILL_TIMEOUT_MS = 5_000;

let runtimeStarted = false;
let runtimeInterval: NodeJS.Timeout | null = null;
let runtimeTickPromise: Promise<void> | null = null;

function buildInternalRecordingSourceUrl(channelId: string) {
  return `http://127.0.0.1:${env.API_PORT}/api/streams/channels/${channelId}/master`;
}

function buildFfmpegArgs(inputUrl: string, outputPath: string) {
  return [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    "-i",
    inputUrl,
    "-map",
    "0",
    "-dn",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

function appendStderrLine(activeRecording: ActiveRecordingProcess, chunk: Buffer) {
  const lines = chunk
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return;
  }

  activeRecording.stderrLines.push(...lines);

  if (activeRecording.stderrLines.length > MAX_STDERR_LINES) {
    activeRecording.stderrLines.splice(0, activeRecording.stderrLines.length - MAX_STDERR_LINES);
  }
}

function buildStderrTail(activeRecording: ActiveRecordingProcess) {
  return activeRecording.stderrLines.length ? activeRecording.stderrLines.join("\n") : null;
}

async function getExistingRecordingFileStats(storagePath: string) {
  try {
    const stats = await readRecordingFileStats(storagePath);
    return {
      absolutePath: stats.absolutePath,
      fileSizeBytes: BigInt(stats.sizeBytes),
    };
  } catch {
    return {
      absolutePath: resolveRecordingAbsolutePath(storagePath),
      fileSizeBytes: null,
    };
  }
}

async function finalizeRecordingProcessExit(
  job: RecordingRuntimeJobRecord,
  activeRecording: ActiveRecordingProcess,
  exitCode: number | null,
  exitSignal: string | null,
) {
  if (activeRecording.isFinalized) {
    return;
  }

  activeRecording.isFinalized = true;
  activeRecordingProcesses.delete(job.id);

  const endedAt = new Date();
  const fileStats = await getExistingRecordingFileStats(activeRecording.storagePath);
  const durationSeconds = Math.max(
    0,
    Math.round((endedAt.getTime() - activeRecording.startedAt.getTime()) / 1000),
  );

  let runStatus: "COMPLETED" | "FAILED" | "CANCELED" = "FAILED";
  let jobStatus: "COMPLETED" | "FAILED" | "CANCELED" = "FAILED";
  let failureReason: string | null = null;
  let createAsset = false;

  if (activeRecording.stopKind === "shutdown") {
    failureReason = activeRecording.stopReason ?? "Recording runtime stopped before completion";
  } else if (activeRecording.stopKind === "manual" || activeRecording.stopKind === "scheduled") {
    if (fileStats.fileSizeBytes && fileStats.fileSizeBytes > BigInt(0)) {
      runStatus = "COMPLETED";
      jobStatus = "COMPLETED";
      createAsset = true;
    } else {
      failureReason = activeRecording.stopReason ?? "Recording finished without media output";
    }
  } else if ((exitCode ?? 1) === 0 && fileStats.fileSizeBytes && fileStats.fileSizeBytes > BigInt(0)) {
    runStatus = "COMPLETED";
    jobStatus = "COMPLETED";
    createAsset = true;
  } else {
    failureReason = buildStderrTail(activeRecording) ?? "ffmpeg exited before recording completed";
  }

  await finalizeRecordingRun({
    recordingJobId: job.id,
    recordingRunId: activeRecording.recordingRunId,
    runStatus,
    jobStatus,
    endedAt,
    exitCode,
    exitSignal,
    failureReason,
    stderrTail: buildStderrTail(activeRecording),
    fileSizeBytes: fileStats.fileSizeBytes,
    durationSeconds,
    createAsset,
  });

  if (!createAsset && fileStats.fileSizeBytes && fileStats.fileSizeBytes > BigInt(0)) {
    await fs.rm(fileStats.absolutePath, { force: true });
  }

  if (jobStatus === "COMPLETED") {
    writeStructuredLog("info", {
      event: "recording.job.completed",
      actorUserId: job.createdByUserId,
      channelId: job.channelId ?? undefined,
      channelSlug: job.channelSlugSnapshot,
      detail: {
        mode: job.mode,
        durationSeconds,
        fileSizeBytes: fileStats.fileSizeBytes ? Number(fileStats.fileSizeBytes) : null,
      },
    });
  } else {
    writeStructuredLog("warn", {
      event: "recording.job.failed",
      actorUserId: job.createdByUserId,
      channelId: job.channelId ?? undefined,
      channelSlug: job.channelSlugSnapshot,
      detail: {
        mode: job.mode,
        reason: failureReason,
        exitCode,
        exitSignal,
      },
    });
  }

  activeRecording.resolveStopPromise();
}

async function startRecordingJobExecution(recordingJobId: string) {
  if (activeRecordingProcesses.has(recordingJobId)) {
    return;
  }

  const pendingJob = await findRecordingRuntimeJobById(recordingJobId);

  if (!pendingJob) {
    return;
  }

  if (!pendingJob.channelId) {
    await failRecordingJobBeforeStart(recordingJobId, "Recording channel is no longer available");
    return;
  }

  if (!pendingJob.channel?.isActive) {
    await failRecordingJobBeforeStart(recordingJobId, "Recording channel is inactive");
    return;
  }

  if (pendingJob.endAt && pendingJob.endAt.getTime() <= Date.now()) {
    await failRecordingJobBeforeStart(recordingJobId, "Recording window ended before capture could start");
    return;
  }

  const output = buildRecordingStoragePath({
    channelSlug: pendingJob.channelSlugSnapshot,
    title: pendingJob.title,
    startAt: pendingJob.startAt,
    recordingJobId,
  });
  const absoluteOutputPath = await ensureRecordingStoragePath(output.storagePath);
  const claimed = await claimRecordingJobStart({
    recordingJobId,
    storagePath: output.storagePath,
    outputFileName: output.outputFileName,
    containerFormat: output.containerFormat,
  });

  if (!claimed) {
    return;
  }

  const sourceUrl = buildInternalRecordingSourceUrl(claimed.job.channelId ?? pendingJob.channelId);
  const childProcess = spawn(env.RECORDINGS_FFMPEG_PATH, buildFfmpegArgs(sourceUrl, absoluteOutputPath), {
    stdio: ["pipe", "ignore", "pipe"],
  });
  const startedAt = new Date();
  let resolveStopPromise: () => void = () => undefined;
  const stopPromise = new Promise<void>((resolve) => {
    resolveStopPromise = resolve;
  });
  const activeRecording: ActiveRecordingProcess = {
    recordingJobId,
    recordingRunId: claimed.run.id,
    storagePath: output.storagePath,
    endAt: claimed.job.endAt,
    startedAt,
    childProcess,
    stderrLines: [],
    stopKind: null,
    stopReason: null,
    isFinalized: false,
    stopPromise,
    resolveStopPromise,
  };

  activeRecordingProcesses.set(recordingJobId, activeRecording);
  childProcess.stderr?.on("data", (chunk: Buffer) => appendStderrLine(activeRecording, chunk));
  childProcess.once("error", async (error) => {
    appendStderrLine(activeRecording, Buffer.from(error.message));
    await finalizeRecordingProcessExit(claimed.job, activeRecording, 1, "spawn-error");
  });
  childProcess.once("exit", (exitCode, exitSignal) => {
    void finalizeRecordingProcessExit(claimed.job, activeRecording, exitCode, exitSignal);
  });

  await markRecordingRunStarted(claimed.run.id, childProcess.pid ?? null, startedAt);

  writeStructuredLog("info", {
    event: "recording.job.started",
    actorUserId: claimed.job.createdByUserId,
    channelId: claimed.job.channelId ?? undefined,
    channelSlug: claimed.job.channelSlugSnapshot,
    detail: {
      mode: claimed.job.mode,
      storagePath: output.storagePath,
      ffmpegPid: childProcess.pid ?? null,
      containerFormat: getRecordingContainerFormat(),
    },
  });
}

async function stopDueRecordings() {
  const now = Date.now();
  const activeRecordings = [...activeRecordingProcesses.values()].filter(
    (activeRecording) => activeRecording.endAt && activeRecording.endAt.getTime() <= now,
  );

  for (const activeRecording of activeRecordings) {
    await stopActiveRecordingJob(activeRecording.recordingJobId, {
      kind: "scheduled",
      reason: "Scheduled recording window ended",
    });
  }
}

async function startDueRecordings() {
  const dueJobs = await listDueRecordingJobs(new Date(), 10);

  for (const dueJob of dueJobs) {
    await startRecordingJobExecution(dueJob.id);
  }
}

async function runRecordingRuntimeTick() {
  if (runtimeTickPromise) {
    return runtimeTickPromise;
  }

  runtimeTickPromise = (async () => {
    await stopDueRecordings();
    await startDueRecordings();
  })().finally(() => {
    runtimeTickPromise = null;
  });

  return runtimeTickPromise;
}

export function pokeRecordingRuntime() {
  if (!runtimeStarted) {
    return;
  }

  void runRecordingRuntimeTick();
}

export async function stopActiveRecordingJob(recordingJobId: string, options: StopRecordingOptions) {
  const activeRecording = activeRecordingProcesses.get(recordingJobId);

  if (!activeRecording) {
    return;
  }

  if (!activeRecording.stopKind) {
    activeRecording.stopKind = options.kind ?? "manual";
    activeRecording.stopReason = options.reason;

    try {
      activeRecording.childProcess.stdin?.write("q\n");
    } catch {
      activeRecording.childProcess.kill("SIGINT");
    }

    setTimeout(() => {
      if (activeRecordingProcesses.has(recordingJobId)) {
        activeRecording.childProcess.kill("SIGINT");
      }
    }, STOP_WAIT_TIMEOUT_MS);

    setTimeout(() => {
      if (activeRecordingProcesses.has(recordingJobId)) {
        activeRecording.childProcess.kill("SIGKILL");
      }
    }, STOP_WAIT_TIMEOUT_MS + STOP_KILL_TIMEOUT_MS);
  }

  if (options.waitForExit) {
    await activeRecording.stopPromise;
  }
}

export async function startRecordingRuntime() {
  if (runtimeStarted) {
    return;
  }

  runtimeStarted = true;
  await fs.mkdir(path.resolve(env.RECORDINGS_STORAGE_DIR), { recursive: true });
  await markInterruptedRecordingRunsFailed("Recording runtime restarted before the previous recording finished");
  runtimeInterval = setInterval(() => {
    void runRecordingRuntimeTick();
  }, env.RECORDINGS_POLL_INTERVAL_MS);

  await runRecordingRuntimeTick();
}

export async function stopRecordingRuntime() {
  if (!runtimeStarted) {
    return;
  }

  runtimeStarted = false;

  if (runtimeInterval) {
    clearInterval(runtimeInterval);
    runtimeInterval = null;
  }

  await Promise.all(
    [...activeRecordingProcesses.keys()].map((recordingJobId) =>
      stopActiveRecordingJob(recordingJobId, {
        kind: "shutdown",
        reason: "Recording runtime stopped before completion",
        waitForExit: true,
      }),
    ),
  );
}
