-- CreateEnum
CREATE TYPE "AuthProviderType" AS ENUM ('LDAP', 'OIDC');

-- CreateEnum
CREATE TYPE "AuthProviderValidationStatus" AS ENUM ('NEVER_VALIDATED', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AuthProvider" (
    "id" UUID NOT NULL,
    "type" "AuthProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isVisibleOnLogin" BOOLEAN NOT NULL DEFAULT true,
    "allowAutoProvision" BOOLEAN NOT NULL DEFAULT false,
    "autoLinkByEmail" BOOLEAN NOT NULL DEFAULT false,
    "autoLinkByUsername" BOOLEAN NOT NULL DEFAULT false,
    "defaultRole" "UserRole" NOT NULL DEFAULT 'USER',
    "configurationJson" JSONB NOT NULL,
    "secretCiphertext" TEXT,
    "lastValidatedAt" TIMESTAMP(3),
    "lastValidationStatus" "AuthProviderValidationStatus" NOT NULL DEFAULT 'NEVER_VALIDATED',
    "lastValidationMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "externalSubject" TEXT NOT NULL,
    "externalUsername" TEXT,
    "externalEmail" TEXT,
    "externalDisplayName" TEXT,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthProvider_type_key" ON "AuthProvider"("type");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_providerId_idx" ON "ExternalIdentity"("userId", "providerId");

-- CreateIndex
CREATE INDEX "ExternalIdentity_providerId_externalUsername_idx" ON "ExternalIdentity"("providerId", "externalUsername");

-- CreateIndex
CREATE INDEX "ExternalIdentity_providerId_externalEmail_idx" ON "ExternalIdentity"("providerId", "externalEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_providerId_externalSubject_key" ON "ExternalIdentity"("providerId", "externalSubject");

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AuthProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
