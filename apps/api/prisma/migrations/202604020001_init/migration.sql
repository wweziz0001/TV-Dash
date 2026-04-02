CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LayoutType') THEN
    CREATE TYPE "LayoutType" AS ENUM (
      'LAYOUT_1X1',
      'LAYOUT_2X2',
      'LAYOUT_3X3',
      'LAYOUT_FOCUS_1_2',
      'LAYOUT_FOCUS_1_4'
    );
  END IF;
END $$;

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelGroup" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Channel" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "logoUrl" TEXT,
  "masterHlsUrl" TEXT NOT NULL,
  "groupId" UUID,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Favorite" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "channelId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedLayout" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "layoutType" "LayoutType" NOT NULL,
  "configJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedLayout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedLayoutItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "savedLayoutId" UUID NOT NULL,
  "tileIndex" INTEGER NOT NULL,
  "channelId" UUID,
  "preferredQuality" TEXT,
  "isMuted" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "SavedLayoutItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "ChannelGroup_slug_key" ON "ChannelGroup"("slug");
CREATE UNIQUE INDEX "Channel_slug_key" ON "Channel"("slug");
CREATE UNIQUE INDEX "Favorite_userId_channelId_key" ON "Favorite"("userId", "channelId");
CREATE UNIQUE INDEX "SavedLayoutItem_savedLayoutId_tileIndex_key" ON "SavedLayoutItem"("savedLayoutId", "tileIndex");

ALTER TABLE "Channel"
  ADD CONSTRAINT "Channel_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "ChannelGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Favorite"
  ADD CONSTRAINT "Favorite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite"
  ADD CONSTRAINT "Favorite_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedLayout"
  ADD CONSTRAINT "SavedLayout_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedLayoutItem"
  ADD CONSTRAINT "SavedLayoutItem_savedLayoutId_fkey"
  FOREIGN KEY ("savedLayoutId") REFERENCES "SavedLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedLayoutItem"
  ADD CONSTRAINT "SavedLayoutItem_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

