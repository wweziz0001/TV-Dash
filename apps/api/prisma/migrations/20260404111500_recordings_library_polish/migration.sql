-- AlterTable
ALTER TABLE "RecordingJob"
ADD COLUMN "programDescriptionSnapshot" TEXT,
ADD COLUMN "programCategorySnapshot" TEXT,
ADD COLUMN "isProtected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "protectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RecordingAsset"
ADD COLUMN "thumbnailPath" TEXT,
ADD COLUMN "thumbnailMimeType" TEXT,
ADD COLUMN "thumbnailGeneratedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RecordingJob_channelId_isProtected_startAt_idx" ON "RecordingJob"("channelId", "isProtected", "startAt");

-- CreateIndex
CREATE INDEX "RecordingJob_isProtected_status_startAt_idx" ON "RecordingJob"("isProtected", "status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingAsset_thumbnailPath_key" ON "RecordingAsset"("thumbnailPath");
