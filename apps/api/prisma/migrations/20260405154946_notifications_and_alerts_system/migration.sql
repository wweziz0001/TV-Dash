-- CreateEnum
CREATE TYPE "OperationalAlertType" AS ENUM ('CHANNEL_STREAM_DOWN', 'CHANNEL_STREAM_RECOVERED', 'RECORDING_STARTED', 'RECORDING_COMPLETED', 'RECORDING_FAILED', 'EPG_IMPORT_FAILED', 'EPG_PARSE_FAILED', 'EPG_IMPORT_SUCCEEDED', 'PROXY_FAILURE', 'PROXY_RECOVERED', 'PLAYBACK_FAILURE', 'PLAYBACK_RECOVERED', 'SYSTEM_WARNING');

-- CreateEnum
CREATE TYPE "OperationalAlertCategory" AS ENUM ('PLAYBACK', 'RECORDING', 'EPG', 'PROXY', 'CHANNEL_HEALTH', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "OperationalAlertSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OperationalAlertStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "OperationalAlertEntityType" AS ENUM ('CHANNEL', 'RECORDING_JOB', 'EPG_SOURCE', 'PLAYBACK_CLUSTER', 'SYSTEM');

-- CreateTable
CREATE TABLE "OperationalAlert" (
    "id" UUID NOT NULL,
    "type" "OperationalAlertType" NOT NULL,
    "category" "OperationalAlertCategory" NOT NULL,
    "severity" "OperationalAlertSeverity" NOT NULL,
    "status" "OperationalAlertStatus" NOT NULL DEFAULT 'NEW',
    "sourceSubsystem" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dedupeKey" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "relatedEntityType" "OperationalAlertEntityType",
    "relatedEntityId" TEXT,
    "metadataJson" JSONB,
    "firstOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,
    "dismissedAt" TIMESTAMP(3),
    "dismissedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationalAlert_status_isActive_lastOccurredAt_idx" ON "OperationalAlert"("status", "isActive", "lastOccurredAt");

-- CreateIndex
CREATE INDEX "OperationalAlert_category_severity_lastOccurredAt_idx" ON "OperationalAlert"("category", "severity", "lastOccurredAt");

-- CreateIndex
CREATE INDEX "OperationalAlert_relatedEntityType_relatedEntityId_lastOccu_idx" ON "OperationalAlert"("relatedEntityType", "relatedEntityId", "lastOccurredAt");

-- CreateIndex
CREATE INDEX "OperationalAlert_dedupeKey_isActive_lastOccurredAt_idx" ON "OperationalAlert"("dedupeKey", "isActive", "lastOccurredAt");

-- CreateIndex
CREATE INDEX "OperationalAlert_sourceSubsystem_lastOccurredAt_idx" ON "OperationalAlert"("sourceSubsystem", "lastOccurredAt");
