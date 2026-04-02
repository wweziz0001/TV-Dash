DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChannelSourceMode') THEN
    CREATE TYPE "ChannelSourceMode" AS ENUM ('MASTER_PLAYLIST', 'MANUAL_VARIANTS');
  END IF;
END $$;

ALTER TABLE "Channel"
  ADD COLUMN IF NOT EXISTS "sourceMode" "ChannelSourceMode" NOT NULL DEFAULT 'MASTER_PLAYLIST';

ALTER TABLE "Channel"
  ALTER COLUMN "masterHlsUrl" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "ChannelQualityVariant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "channelId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "playlistUrl" TEXT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "bandwidth" INTEGER,
  "codecs" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelQualityVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChannelQualityVariant_channelId_sortOrder_key"
  ON "ChannelQualityVariant"("channelId", "sortOrder");

CREATE INDEX IF NOT EXISTS "ChannelQualityVariant_channelId_isActive_sortOrder_idx"
  ON "ChannelQualityVariant"("channelId", "isActive", "sortOrder");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ChannelQualityVariant_channelId_fkey'
      AND table_name = 'ChannelQualityVariant'
  ) THEN
    ALTER TABLE "ChannelQualityVariant"
      ADD CONSTRAINT "ChannelQualityVariant_channelId_fkey"
      FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
