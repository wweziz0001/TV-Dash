-- CreateEnum
CREATE TYPE "EpgImportStatus" AS ENUM ('NEVER_IMPORTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProgramEntrySource" AS ENUM ('IMPORTED', 'MANUAL');

-- AlterEnum
BEGIN;
CREATE TYPE "EpgSourceType_new" AS ENUM ('XMLTV_URL', 'XMLTV_FILE');
ALTER TABLE "public"."EpgSource" ALTER COLUMN "sourceType" DROP DEFAULT;
ALTER TABLE "EpgSource"
  ALTER COLUMN "sourceType" TYPE "EpgSourceType_new"
  USING (
    CASE
      WHEN "sourceType"::text = 'XMLTV' THEN 'XMLTV_URL'
      ELSE "sourceType"::text
    END
  )::"EpgSourceType_new";
ALTER TYPE "EpgSourceType" RENAME TO "EpgSourceType_old";
ALTER TYPE "EpgSourceType_new" RENAME TO "EpgSourceType";
DROP TYPE "public"."EpgSourceType_old";
ALTER TABLE "EpgSource" ALTER COLUMN "sourceType" SET DEFAULT 'XMLTV_URL';
COMMIT;

-- AlterTable
ALTER TABLE "EpgSource" ADD COLUMN     "lastImportChannelCount" INTEGER,
ADD COLUMN     "lastImportMessage" TEXT,
ADD COLUMN     "lastImportProgramCount" INTEGER,
ADD COLUMN     "lastImportStartedAt" TIMESTAMP(3),
ADD COLUMN     "lastImportStatus" "EpgImportStatus" NOT NULL DEFAULT 'NEVER_IMPORTED',
ADD COLUMN     "lastImportedAt" TIMESTAMP(3),
ADD COLUMN     "uploadedFileName" TEXT,
ALTER COLUMN "sourceType" SET DEFAULT 'XMLTV_URL',
ALTER COLUMN "url" DROP NOT NULL,
ALTER COLUMN "refreshIntervalMinutes" DROP NOT NULL,
ALTER COLUMN "refreshIntervalMinutes" DROP DEFAULT;

-- CreateTable
CREATE TABLE "EpgSourceChannel" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "displayNames" JSONB,
    "iconUrl" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpgSourceChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpgChannelMapping" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "sourceChannelId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpgChannelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramEntry" (
    "id" UUID NOT NULL,
    "sourceKind" "ProgramEntrySource" NOT NULL,
    "sourceId" UUID,
    "sourceChannelId" UUID,
    "channelId" UUID,
    "externalProgramId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "category" TEXT,
    "imageUrl" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramEntry_pkey" PRIMARY KEY ("id")
);

-- Backfill existing direct channel guide links into the new mapping foundation before dropping legacy columns.
INSERT INTO "EpgSourceChannel" (
    "id",
    "sourceId",
    "externalId",
    "displayName",
    "displayNames",
    "iconUrl",
    "isAvailable",
    "lastSeenAt",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    "Channel"."epgSourceId",
    "Channel"."epgChannelId",
    COALESCE("Channel"."name", "Channel"."slug"),
    to_jsonb(ARRAY[COALESCE("Channel"."name", "Channel"."slug")]),
    NULL,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Channel"
WHERE "Channel"."epgSourceId" IS NOT NULL
  AND "Channel"."epgChannelId" IS NOT NULL;

INSERT INTO "EpgChannelMapping" (
    "id",
    "channelId",
    "sourceChannelId",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    "Channel"."id",
    "EpgSourceChannel"."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Channel"
JOIN "EpgSourceChannel"
  ON "EpgSourceChannel"."sourceId" = "Channel"."epgSourceId"
 AND "EpgSourceChannel"."externalId" = "Channel"."epgChannelId"
WHERE "Channel"."epgSourceId" IS NOT NULL
  AND "Channel"."epgChannelId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "EpgSourceChannel_sourceId_isAvailable_displayName_idx" ON "EpgSourceChannel"("sourceId", "isAvailable", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "EpgSourceChannel_sourceId_externalId_key" ON "EpgSourceChannel"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "EpgChannelMapping_channelId_key" ON "EpgChannelMapping"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "EpgChannelMapping_sourceChannelId_key" ON "EpgChannelMapping"("sourceChannelId");

-- CreateIndex
CREATE INDEX "ProgramEntry_channelId_sourceKind_startAt_idx" ON "ProgramEntry"("channelId", "sourceKind", "startAt");

-- CreateIndex
CREATE INDEX "ProgramEntry_sourceChannelId_startAt_idx" ON "ProgramEntry"("sourceChannelId", "startAt");

-- CreateIndex
CREATE INDEX "ProgramEntry_sourceId_sourceKind_startAt_idx" ON "ProgramEntry"("sourceId", "sourceKind", "startAt");

-- DropForeignKey
ALTER TABLE "Channel" DROP CONSTRAINT "Channel_epgSourceId_fkey";

-- DropIndex
DROP INDEX "Channel_epgSourceId_epgChannelId_idx";

-- AlterTable
ALTER TABLE "Channel" DROP COLUMN "epgChannelId",
DROP COLUMN "epgSourceId";

-- AddForeignKey
ALTER TABLE "EpgSourceChannel" ADD CONSTRAINT "EpgSourceChannel_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EpgSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpgChannelMapping" ADD CONSTRAINT "EpgChannelMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpgChannelMapping" ADD CONSTRAINT "EpgChannelMapping_sourceChannelId_fkey" FOREIGN KEY ("sourceChannelId") REFERENCES "EpgSourceChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEntry" ADD CONSTRAINT "ProgramEntry_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EpgSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEntry" ADD CONSTRAINT "ProgramEntry_sourceChannelId_fkey" FOREIGN KEY ("sourceChannelId") REFERENCES "EpgSourceChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEntry" ADD CONSTRAINT "ProgramEntry_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
