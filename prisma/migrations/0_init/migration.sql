-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AllowlistUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowlistUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlateSnapshot" (
    "id" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "games" JSONB NOT NULL,
    "slate" JSONB NOT NULL,
    "settledAt" TIMESTAMP(3),
    "scores" JSONB,
    "settled" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CfbTeam" (
    "id" INTEGER NOT NULL,
    "school" TEXT NOT NULL,
    "mascot" TEXT,
    "alternateNames" TEXT[],
    "conference" TEXT,
    "classification" TEXT,

    CONSTRAINT "CfbTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CfbGame" (
    "id" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "seasonType" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "neutralSite" BOOLEAN NOT NULL,
    "conferenceGame" BOOLEAN NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "homeConference" TEXT,
    "awayConference" TEXT,
    "homeClassification" TEXT,
    "awayClassification" TEXT,
    "homePoints" INTEGER,
    "awayPoints" INTEGER,
    "homeElo" INTEGER,
    "awayElo" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CfbGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameLine" (
    "gameId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "spread" DOUBLE PRECISION,
    "spreadOpen" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "totalOpen" DOUBLE PRECISION,
    "homeMoneyline" INTEGER,
    "awayMoneyline" INTEGER,

    CONSTRAINT "GameLine_pkey" PRIMARY KEY ("gameId","provider")
);

-- CreateTable
CREATE TABLE "ApiCall" (
    "id" TEXT NOT NULL,
    "api" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "remaining" INTEGER,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "spec" JSONB,
    "specHash" TEXT,
    "backtestRunId" TEXT,
    "meta" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyBoard" (
    "strategyId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "seasonType" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "candidates" INTEGER NOT NULL,

    CONSTRAINT "StrategyBoard_pkey" PRIMARY KEY ("strategyId","season","seasonType","week")
);

-- CreateTable
CREATE TABLE "StrategyPick" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "gameId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "seasonType" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "line" DOUBLE PRECISION,
    "provider" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "inputs" JSONB NOT NULL,
    "pickedAt" TIMESTAMP(3) NOT NULL,
    "result" TEXT,
    "profit" DOUBLE PRECISION,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "StrategyPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "specHash" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "dataVersion" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AllowlistUser_email_key" ON "AllowlistUser"("email");

-- CreateIndex
CREATE INDEX "SlateSnapshot_fetchedAt_idx" ON "SlateSnapshot"("fetchedAt");

-- CreateIndex
CREATE INDEX "SlateSnapshot_settledAt_idx" ON "SlateSnapshot"("settledAt");

-- CreateIndex
CREATE INDEX "CfbGame_season_seasonType_week_idx" ON "CfbGame"("season", "seasonType", "week");

-- CreateIndex
CREATE INDEX "CfbGame_startsAt_idx" ON "CfbGame"("startsAt");

-- CreateIndex
CREATE INDEX "ApiCall_api_createdAt_idx" ON "ApiCall"("api", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_slug_key" ON "Strategy"("slug");

-- CreateIndex
CREATE INDEX "StrategyPick_strategyId_season_seasonType_week_idx" ON "StrategyPick"("strategyId", "season", "seasonType", "week");

-- CreateIndex
CREATE INDEX "StrategyPick_result_idx" ON "StrategyPick"("result");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyPick_strategyId_gameId_market_selection_key" ON "StrategyPick"("strategyId", "gameId", "market", "selection");

-- CreateIndex
CREATE INDEX "BacktestRun_specHash_idx" ON "BacktestRun"("specHash");

-- CreateIndex
CREATE INDEX "ChatThread_userEmail_updatedAt_idx" ON "ChatThread"("userEmail", "updatedAt");

-- AddForeignKey
ALTER TABLE "GameLine" ADD CONSTRAINT "GameLine_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "CfbGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_backtestRunId_fkey" FOREIGN KEY ("backtestRunId") REFERENCES "BacktestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyBoard" ADD CONSTRAINT "StrategyBoard_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPick" ADD CONSTRAINT "StrategyPick_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPick" ADD CONSTRAINT "StrategyPick_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "CfbGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

