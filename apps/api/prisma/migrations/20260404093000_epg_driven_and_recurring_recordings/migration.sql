-- AlterEnum
ALTER TYPE "RecordingMode" RENAME VALUE 'EPG' TO 'EPG_PROGRAM';

-- AlterEnum
ALTER TYPE "RecordingMode" ADD VALUE 'RECURRING_RULE';

-- CreateEnum
CREATE TYPE "RecordingRecurrenceType" AS ENUM ('DAILY', 'WEEKLY', 'WEEKDAYS');

-- CreateEnum
CREATE TYPE "RecordingWeekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "RecordingRule" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "recurrenceType" "RecordingRecurrenceType" NOT NULL,
    "weekdays" "RecordingWeekday"[] DEFAULT ARRAY[]::"RecordingWeekday"[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "timeZone" TEXT NOT NULL,
    "paddingBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "paddingAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "requestedQualitySelector" TEXT,
    "requestedQualityLabel" TEXT,
    "originProgramEntryId" UUID,
    "originProgramTitleSnapshot" TEXT,
    "originProgramStartAt" TIMESTAMP(3),
    "originProgramEndAt" TIMESTAMP(3),
    "matchProgramTitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingRule_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "RecordingJob"
ADD COLUMN "programTitleSnapshot" TEXT,
ADD COLUMN "programStartAt" TIMESTAMP(3),
ADD COLUMN "programEndAt" TIMESTAMP(3),
ADD COLUMN "recordingRuleId" UUID,
ADD COLUMN "recordingRuleNameSnapshot" TEXT,
ADD COLUMN "paddingBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "paddingAfterMinutes" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "RecordingRule_createdByUserId_isActive_createdAt_idx" ON "RecordingRule"("createdByUserId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "RecordingRule_channelId_isActive_createdAt_idx" ON "RecordingRule"("channelId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "RecordingRule_isActive_createdAt_idx" ON "RecordingRule"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "RecordingJob_recordingRuleId_startAt_idx" ON "RecordingJob"("recordingRuleId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingJob_recordingRuleId_startAt_key" ON "RecordingJob"("recordingRuleId", "startAt");

-- AddForeignKey
ALTER TABLE "RecordingRule" ADD CONSTRAINT "RecordingRule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingRule" ADD CONSTRAINT "RecordingRule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingRule" ADD CONSTRAINT "RecordingRule_originProgramEntryId_fkey" FOREIGN KEY ("originProgramEntryId") REFERENCES "ProgramEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingJob" ADD CONSTRAINT "RecordingJob_recordingRuleId_fkey" FOREIGN KEY ("recordingRuleId") REFERENCES "RecordingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
