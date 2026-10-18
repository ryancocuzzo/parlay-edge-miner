-- AlterTable
ALTER TABLE "AllowlistUser" ADD COLUMN     "factoryPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "factoryPerDay" INTEGER,
ADD COLUMN     "factoryPerHour" INTEGER;

-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "brief" TEXT,
    "screenshots" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "statusDetail" TEXT,
    "agentId" TEXT,
    "runId" TEXT,
    "usage" JSONB,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dispatchedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactorySettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "perHour" INTEGER NOT NULL DEFAULT 2,
    "perDay" INTEGER NOT NULL DEFAULT 5,
    "maxActive" INTEGER NOT NULL DEFAULT 1,
    "dailyBudgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-5-5',
    "inputUsdPerM" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "outputUsdPerM" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "cacheReadUsdPerM" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "cacheWriteUsdPerM" DOUBLE PRECISION NOT NULL DEFAULT 2.5,

    CONSTRAINT "FactorySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureRequest_userEmail_createdAt_idx" ON "FeatureRequest"("userEmail", "createdAt");

-- CreateIndex
CREATE INDEX "FeatureRequest_status_idx" ON "FeatureRequest"("status");

