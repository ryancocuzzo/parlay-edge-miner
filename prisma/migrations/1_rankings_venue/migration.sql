-- AlterTable
ALTER TABLE "CfbGame" ADD COLUMN     "venue" TEXT;

-- CreateTable
CREATE TABLE "CfbRanking" (
    "season" INTEGER NOT NULL,
    "seasonType" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "poll" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "CfbRanking_pkey" PRIMARY KEY ("season","seasonType","week","poll","school")
);

