-- AlterTable
ALTER TABLE "Channel"
ADD COLUMN "timeshiftEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "timeshiftWindowMinutes" INTEGER;
