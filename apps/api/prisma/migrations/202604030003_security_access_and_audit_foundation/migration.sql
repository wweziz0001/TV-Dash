ALTER TABLE "User"
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorUserId" UUID,
  "actorRole" "UserRole",
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "targetName" TEXT,
  "detailJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");
CREATE INDEX "AuditEvent_targetType_targetId_createdAt_idx" ON "AuditEvent"("targetType", "targetId", "createdAt");
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
