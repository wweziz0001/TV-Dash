import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { writeStructuredLog } from "../../app/structured-log.js";
import { createOperationalNotification } from "../alerts/alert.service.js";
import { getChannelStreamDetails } from "../channels/channel.service.js";
import {
  claimRecordingJobStart,
  deleteRecordingJob,
  failRecordingJobBeforeStart,
  finalizeRecordingRun,
  findRecordingThumbnailAssetByJobId,
  findRecordingRuntimeJobById,
  listDueRecordingJobs,
  listRecordingRetentionCandidates,
  markInterruptedRecordingRunsFailed,
  markRecordingRunStarted,
  updateRecordingAssetThumbnail,
  type RecordingRuntimeJobRecord,
} from "./recording.repository.js";
import { evaluateRecordingRetention } from "./recording-retention.js";
import {
  buildRecordingStoragePath,
  deleteRecordingFile,
  ensureRecordingStoragePath,
  getRecordingContainerFormat,
  inspectRecordingOutput,
  resolveRecordingAbsolutePath,
} from "./recording-storage.js";
import { generateRecordingThumbnail } from "./recording-thumbnail.js";
import { buildRecordingInputConfig } from "./recording-input.js";
import { getRecordingFfmpegCapabilities } from "./recording-ffmpeg-capabilities.js";
import { buildRecordingFfmpegArgs } from "./recording-ffmpeg.js";
import { syncRecurringRecordingJobs } from "./recording-rule-sync.js";

interface StopRecordingOptions {
  reason: string;
  kind?: "manual" | "scheduled" | "shutdown";
  waitForExit?: boolean;
}

interface ActiveRecordingProcess {
  recordingJobId: string;
  recordingRunId: string;
  storagePath: string;
  temporaryInputFilePath: string | null;
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
let lastRetentionSweepAt = 0;

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
    const stats = await inspectRecordingOutput(storagePath);
    return {
      absolutePath: stats.absolutePath,
      fileSizeBytes: stats.fileSizeBytes,
      durationSeconds: stats.durationSeconds,
      isPlayable: stats.isPlayable,
      validationReason: stats.validationReason,
    };
  } catch {
    return {
      absolutePath: resolveRecordingAbsolutePath(storagePath),
      fileSizeBytes: null,
      durationSeconds: null,
      isPlayable: false,
      validationReason: null,
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
  const durationSeconds =
    fileStats.durationSeconds !== null
      ? Math.max(1, Math.round(fileStats.durationSeconds))
      : Math.max(0, Math.round((endedAt.getTime() - activeRecording.startedAt.getTime()) / 1000));

  let runStatus: "COMPLETED" | "FAILED" | "CANCELED" = "FAILED";
  let jobStatus: "COMPLETED" | "FAILED" | "CANCELED" = "FAILED";
  let failureReason: string | null = null;
  let createAsset = false;

  if (activeRecording.stopKind === "shutdown") {
    failureReason = activeRecording.stopReason ?? "Recording runtime stopped before completion";
  } else if (activeRecording.stopKind === "manual" || activeRecording.stopKind === "scheduled") {
    if (fileStats.isPlayable && fileStats.fileSizeBytes && fileStats.fileSizeBytes > BigInt(0)) {
      runStatus = "COMPLETED";
      jobStatus = "COMPLETED";
      createAsset = true;
    } else {
      failureReason =
        fileStats.validationReason ?? activeRecording.stopReason ?? "Recording finished without playable media output";
    }
  } else if ((exitCode ?? 1) === 0 && fileStats.isPlayable && fileStats.fileSizeBytes && fileStats.fileSizeBytes > BigInt(0)) {
    runStatus = "COMPLETED";
    jobStatus = "COMPLETED";
    createAsset = true;
  } else {
    failureReason =
      buildStderrTail(activeRecording) ??
      fileStats.validationReason ??
      "ffmpeg exited before recording completed";
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

  if (createAsset) {
    await maybeGenerateRecordingThumbnail(job.id);
  }

  if (!createAsset && fileStats.fileSizeBytes && fileStats.fileSizeBytes > BigInt(0)) {
    await fs.rm(fileStats.absolutePath, { force: true });
  }

  if (activeRecording.temporaryInputFilePath) {
    await fs.rm(activeRecording.temporaryInputFilePath, { force: true });
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
    await createOperationalNotification({
      type: "RECORDING_COMPLETED",
      category: "RECORDING",
      severity: "SUCCESS",
      sourceSubsystem: "recordings.runtime",
      title: `${job.title} completed`,
      message: `Recording completed successfully for ${job.channelNameSnapshot}.`,
      relatedEntityType: "RECORDING_JOB",
      relatedEntityId: job.id,
      metadata: {
        recordingTitle: job.title,
        channelName: job.channelNameSnapshot,
        channelSlug: job.channelSlugSnapshot,
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
    await createOperationalNotification({
      type: "RECORDING_FAILED",
      category: "RECORDING",
      severity: "ERROR",
      sourceSubsystem: "recordings.runtime",
      title: `${job.title} failed`,
      message: failureReason ?? `Recording failed for ${job.channelNameSnapshot}.`,
      relatedEntityType: "RECORDING_JOB",
      relatedEntityId: job.id,
      metadata: {
        recordingTitle: job.title,
        channelName: job.channelNameSnapshot,
        channelSlug: job.channelSlugSnapshot,
        exitCode,
        exitSignal,
        reason: failureReason ?? "Unknown recording failure",
      },
    });
  }

  activeRecording.resolveStopPromise();
}

async function maybeGenerateRecordingThumbnail(recordingJobId: string) {
  const asset = await findRecordingThumbnailAssetByJobId(recordingJobId);

  if (!asset || asset.thumbnailPath) {
    return;
  }

  const generatedThumbnail = await generateRecordingThumbnail({
    storagePath: asset.storagePath,
    durationSeconds: asset.durationSeconds,
  });

  if (!generatedThumbnail) {
    return;
  }

  await updateRecordingAssetThumbnail(asset.id, generatedThumbnail);
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

  const streamDetails = await getChannelStreamDetails(claimed.job.channelId ?? pendingJob.channelId);

  if (!streamDetails) {
    await finalizeRecordingRun({
      recordingJobId: claimed.job.id,
      recordingRunId: claimed.run.id,
      runStatus: "FAILED",
      jobStatus: "FAILED",
      endedAt: new Date(),
      exitCode: null,
      exitSignal: null,
      failureReason: "Recording channel is no longer available",
      stderrTail: null,
      fileSizeBytes: null,
      durationSeconds: 0,
      createAsset: false,
    });
    return;
  }

  const ffmpegCapabilities = await getRecordingFfmpegCapabilities();
  const inputConfig = await buildRecordingInputConfig(
    streamDetails,
    env.API_PORT,
    claimed.job.requestedQualitySelector,
    ffmpegCapabilities,
  );
  const ffmpegArgs = buildRecordingFfmpegArgs(inputConfig, absoluteOutputPath, claimed.job.requestedQualitySelector);
  const childProcess = spawn(
    ffmpegCapabilities.binaryPath,
    ffmpegArgs,
    {
      stdio: ["pipe", "ignore", "pipe"],
    },
  );
  const startedAt = new Date();
  let resolveStopPromise: () => void = () => undefined;
  const stopPromise = new Promise<void>((resolve) => {
    resolveStopPromise = resolve;
  });
  const activeRecording: ActiveRecordingProcess = {
    recordingJobId,
    recordingRunId: claimed.run.id,
    storagePath: output.storagePath,
    temporaryInputFilePath: inputConfig.temporaryFilePath,
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
      ffmpegConfiguredPath: ffmpegCapabilities.configuredPath,
      ffmpegBinaryPath: ffmpegCapabilities.binaryPath,
      ffmpegVersion: ffmpegCapabilities.version,
      supportsAllowedSegmentExtensions: ffmpegCapabilities.supportsAllowedSegmentExtensions,
      supportsExtensionPicky: ffmpegCapabilities.supportsExtensionPicky,
    },
  });
  await createOperationalNotification({
    type: "RECORDING_STARTED",
    category: "RECORDING",
    severity: "INFO",
    sourceSubsystem: "recordings.runtime",
    title: `${claimed.job.title} started`,
    message: `Recording started for ${claimed.job.channelNameSnapshot}.`,
    relatedEntityType: "RECORDING_JOB",
    relatedEntityId: claimed.job.id,
    metadata: {
      recordingTitle: claimed.job.title,
      channelName: claimed.job.channelNameSnapshot,
      channelSlug: claimed.job.channelSlugSnapshot,
      mode: claimed.job.mode,
      ffmpegPid: childProcess.pid ?? null,
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

async function runRetentionSweepIfDue() {
  const now = Date.now();

  if (lastRetentionSweepAt && now - lastRetentionSweepAt < env.RECORDINGS_RETENTION_SWEEP_INTERVAL_MS) {
    return;
  }

  lastRetentionSweepAt = now;
  const candidates = await listRecordingRetentionCandidates();
  const decisions = evaluateRecordingRetention(candidates, new Date(now));

  for (const decision of decisions) {
    const deletedJob = await deleteRecordingJob(decision.jobId);
    const storagePaths = [
      ...new Set(
        [deletedJob.asset?.storagePath, deletedJob.asset?.thumbnailPath, ...deletedJob.runs.map((run) => run.storagePath)].filter(
          (storagePath): storagePath is string => Boolean(storagePath),
        ),
      ),
    ];

    await Promise.all(storagePaths.map((storagePath) => deleteRecordingFile(storagePath)));
    writeStructuredLog("info", {
      event: "recording.retention.deleted",
      channelId: deletedJob.channelId ?? undefined,
      channelSlug: deletedJob.channelSlugSnapshot,
      detail: {
        reason: decision.deleteReason,
        status: deletedJob.status,
      },
    });
  }
}

async function runRecordingRuntimeTick() {
  if (runtimeTickPromise) {
    return runtimeTickPromise;
  }

  runtimeTickPromise = (async () => {
    await stopDueRecordings();
    await syncRecurringRecordingJobs();
    await startDueRecordings();
    await runRetentionSweepIfDue();
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
