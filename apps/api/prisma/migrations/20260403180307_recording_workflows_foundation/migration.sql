-- CreateEnum
CREATE TYPE "RecordingMode" AS ENUM ('IMMEDIATE', 'TIMED', 'SCHEDULED', 'EPG');

-- CreateEnum
CREATE TYPE "RecordingJobStatus" AS ENUM ('PENDING', 'SCHEDULED', 'RECORDING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RecordingRunStatus" AS ENUM ('STARTING', 'RECORDING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "RecordingJob" (
    "id" UUID NOT NULL,
    "channelId" UUID,
    "channelNameSnapshot" TEXT NOT NULL,
    "channelSlugSnapshot" TEXT NOT NULL,
    "programEntryId" UUID,
    "createdByUserId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "RecordingMode" NOT NULL,
    "status" "RecordingJobStatus" NOT NULL DEFAULT 'PENDING',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingRun" (
    "id" UUID NOT NULL,
    "recordingJobId" UUID NOT NULL,
    "status" "RecordingRunStatus" NOT NULL DEFAULT 'STARTING',
    "storagePath" TEXT NOT NULL,
    "outputFileName" TEXT NOT NULL,
    "containerFormat" TEXT NOT NULL,
    "ffmpegPid" INTEGER,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "exitCode" INTEGER,
    "exitSignal" TEXT,
    "failureReason" TEXT,
    "stderrTail" TEXT,
    "fileSizeBytes" BIGINT,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingAsset" (
    "id" UUID NOT NULL,
    "recordingJobId" UUID NOT NULL,
    "recordingRunId" UUID NOT NULL,
    "channelId" UUID,
    "channelNameSnapshot" TEXT NOT NULL,
    "channelSlugSnapshot" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "containerFormat" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER,
    "fileSizeBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordingJob_createdByUserId_status_startAt_idx" ON "RecordingJob"("createdByUserId", "status", "startAt");

-- CreateIndex
CREATE INDEX "RecordingJob_channelId_startAt_idx" ON "RecordingJob"("channelId", "startAt");

-- CreateIndex
CREATE INDEX "RecordingJob_programEntryId_startAt_idx" ON "RecordingJob"("programEntryId", "startAt");

-- CreateIndex
CREATE INDEX "RecordingJob_status_startAt_idx" ON "RecordingJob"("status", "startAt");

-- CreateIndex
CREATE INDEX "RecordingRun_recordingJobId_createdAt_idx" ON "RecordingRun"("recordingJobId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordingRun_status_createdAt_idx" ON "RecordingRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingRun_storagePath_key" ON "RecordingRun"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingAsset_recordingJobId_key" ON "RecordingAsset"("recordingJobId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingAsset_recordingRunId_key" ON "RecordingAsset"("recordingRunId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingAsset_storagePath_key" ON "RecordingAsset"("storagePath");

-- CreateIndex
CREATE INDEX "RecordingAsset_channelId_createdAt_idx" ON "RecordingAsset"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordingAsset_createdAt_idx" ON "RecordingAsset"("createdAt");

-- AddForeignKey
ALTER TABLE "RecordingJob" ADD CONSTRAINT "RecordingJob_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingJob" ADD CONSTRAINT "RecordingJob_programEntryId_fkey" FOREIGN KEY ("programEntryId") REFERENCES "ProgramEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingJob" ADD CONSTRAINT "RecordingJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingRun" ADD CONSTRAINT "RecordingRun_recordingJobId_fkey" FOREIGN KEY ("recordingJobId") REFERENCES "RecordingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingAsset" ADD CONSTRAINT "RecordingAsset_recordingJobId_fkey" FOREIGN KEY ("recordingJobId") REFERENCES "RecordingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingAsset" ADD CONSTRAINT "RecordingAsset_recordingRunId_fkey" FOREIGN KEY ("recordingRunId") REFERENCES "RecordingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingAsset" ADD CONSTRAINT "RecordingAsset_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
