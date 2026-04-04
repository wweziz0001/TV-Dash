ALTER TYPE "PlaybackSessionState" ADD VALUE IF NOT EXISTS 'paused';

CREATE TYPE "PlaybackPositionState" AS ENUM ('LIVE_EDGE', 'BEHIND_LIVE', 'PAUSED');

ALTER TABLE "PlaybackSession"
ADD COLUMN "surfaceId" UUID,
ADD COLUMN "playbackPositionState" "PlaybackPositionState" NOT NULL DEFAULT 'LIVE_EDGE',
ADD COLUMN "liveOffsetSeconds" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "PlaybackSession_surfaceId_endedAt_lastSeenAt_idx"
ON "PlaybackSession"("surfaceId", "endedAt", "lastSeenAt");

CREATE INDEX "PlaybackSession_channelId_playbackPositionState_endedAt_lastSeenAt_idx"
ON "PlaybackSession"("channelId", "playbackPositionState", "endedAt", "lastSeenAt");
