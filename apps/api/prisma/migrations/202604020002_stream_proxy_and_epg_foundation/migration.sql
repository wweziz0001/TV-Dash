DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StreamPlaybackMode') THEN
    CREATE TYPE "StreamPlaybackMode" AS ENUM ('DIRECT', 'PROXY');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EpgSourceType') THEN
    CREATE TYPE "EpgSourceType" AS ENUM ('XMLTV');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EpgSource" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sourceType" "EpgSourceType" NOT NULL DEFAULT 'XMLTV',
  "url" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "refreshIntervalMinutes" INTEGER NOT NULL DEFAULT 360,
  "requestUserAgent" TEXT,
  "requestReferrer" TEXT,
  "requestHeaders" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EpgSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EpgSource_slug_key" ON "EpgSource"("slug");

ALTER TABLE "Channel"
  ADD COLUMN IF NOT EXISTS "playbackMode" "StreamPlaybackMode" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN IF NOT EXISTS "upstreamUserAgent" TEXT,
  ADD COLUMN IF NOT EXISTS "upstreamReferrer" TEXT,
  ADD COLUMN IF NOT EXISTS "upstreamHeaders" JSONB,
  ADD COLUMN IF NOT EXISTS "epgSourceId" UUID,
  ADD COLUMN IF NOT EXISTS "epgChannelId" TEXT;

CREATE INDEX IF NOT EXISTS "Channel_epgSourceId_epgChannelId_idx" ON "Channel"("epgSourceId", "epgChannelId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Channel_epgSourceId_fkey'
      AND table_name = 'Channel'
  ) THEN
    ALTER TABLE "Channel"
      ADD CONSTRAINT "Channel_epgSourceId_fkey"
      FOREIGN KEY ("epgSourceId") REFERENCES "EpgSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
