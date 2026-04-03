-- CreateEnum
CREATE TYPE "PlaybackSessionType" AS ENUM ('SINGLE_VIEW', 'MULTIVIEW');

-- CreateEnum
CREATE TYPE "PlaybackSessionState" AS ENUM ('idle', 'loading', 'playing', 'buffering', 'retrying', 'error');

-- CreateTable
CREATE TABLE "PlaybackSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channelId" UUID,
    "sessionType" "PlaybackSessionType" NOT NULL,
    "playbackState" "PlaybackSessionState" NOT NULL,
    "selectedQuality" TEXT,
    "isMuted" BOOLEAN NOT NULL DEFAULT true,
    "tileIndex" INTEGER,
    "failureKind" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybackSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaybackSession_endedAt_lastSeenAt_idx" ON "PlaybackSession"("endedAt", "lastSeenAt");

-- CreateIndex
CREATE INDEX "PlaybackSession_userId_endedAt_lastSeenAt_idx" ON "PlaybackSession"("userId", "endedAt", "lastSeenAt");

-- CreateIndex
CREATE INDEX "PlaybackSession_channelId_endedAt_lastSeenAt_idx" ON "PlaybackSession"("channelId", "endedAt", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
