-- AlterTable
ALTER TABLE "CampaignQuestObjective" ADD COLUMN "objectiveType" TEXT;
ALTER TABLE "CampaignQuestObjective" ADD COLUMN "xpAwarded" INTEGER NOT NULL DEFAULT 0;
