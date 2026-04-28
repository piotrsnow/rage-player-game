/*
  Warnings:

  - You are about to drop the column `discoveredLocationIds` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `discoveredSubLocationIds` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `heardAboutLocationIds` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `prerequisiteQuestIds` on the `CampaignQuest` table. All the data in the column will be lost.
  - You are about to drop the column `clearedDungeonIds` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `discoveredEdgeIds` on the `UserWorldKnowledge` table. All the data in the column will be lost.
  - You are about to drop the column `discoveredLocationIds` on the `UserWorldKnowledge` table. All the data in the column will be lost.
  - You are about to drop the column `heardAboutLocationIds` on the `UserWorldKnowledge` table. All the data in the column will be lost.
  - You are about to drop the column `discoveredByCampaigns` on the `WorldLocationEdge` table. All the data in the column will be lost.
  - You are about to drop the column `knownLocationIds` on the `WorldNPC` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DiscoveryState" AS ENUM ('heard_about', 'visited');

-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "discoveredLocationIds",
DROP COLUMN "discoveredSubLocationIds",
DROP COLUMN "heardAboutLocationIds";

-- AlterTable
ALTER TABLE "CampaignQuest" DROP COLUMN "prerequisiteQuestIds";

-- AlterTable
ALTER TABLE "Character" DROP COLUMN "clearedDungeonIds";

-- AlterTable
ALTER TABLE "UserWorldKnowledge" DROP COLUMN "discoveredEdgeIds",
DROP COLUMN "discoveredLocationIds",
DROP COLUMN "heardAboutLocationIds";

-- AlterTable
ALTER TABLE "WorldLocationEdge" DROP COLUMN "discoveredByCampaigns";

-- AlterTable
ALTER TABLE "WorldNPC" DROP COLUMN "knownLocationIds";

-- CreateTable
CREATE TABLE "CampaignDiscoveredLocation" (
    "campaignId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "state" "DiscoveryState" NOT NULL,
    "discoveredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignDiscoveredLocation_pkey" PRIMARY KEY ("campaignId","locationId")
);

-- CreateTable
CREATE TABLE "UserDiscoveredLocation" (
    "userId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "state" "DiscoveryState" NOT NULL,
    "discoveredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDiscoveredLocation_pkey" PRIMARY KEY ("userId","locationId")
);

-- CreateTable
CREATE TABLE "UserDiscoveredEdge" (
    "userId" UUID NOT NULL,
    "edgeId" UUID NOT NULL,
    "discoveredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDiscoveredEdge_pkey" PRIMARY KEY ("userId","edgeId")
);

-- CreateTable
CREATE TABLE "CampaignEdgeDiscovery" (
    "edgeId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "discoveredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEdgeDiscovery_pkey" PRIMARY KEY ("edgeId","campaignId")
);

-- CreateTable
CREATE TABLE "WorldNpcKnownLocation" (
    "npcId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "grantedBy" TEXT NOT NULL DEFAULT 'seed',
    "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldNpcKnownLocation_pkey" PRIMARY KEY ("npcId","locationId")
);

-- CreateTable
CREATE TABLE "CharacterClearedDungeon" (
    "characterId" UUID NOT NULL,
    "dungeonId" UUID NOT NULL,
    "clearedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterClearedDungeon_pkey" PRIMARY KEY ("characterId","dungeonId")
);

-- CreateTable
CREATE TABLE "CampaignQuestPrerequisite" (
    "questId" UUID NOT NULL,
    "prerequisiteId" UUID NOT NULL,

    CONSTRAINT "CampaignQuestPrerequisite_pkey" PRIMARY KEY ("questId","prerequisiteId")
);

-- CreateIndex
CREATE INDEX "CampaignDiscoveredLocation_locationId_idx" ON "CampaignDiscoveredLocation"("locationId");

-- CreateIndex
CREATE INDEX "CampaignDiscoveredLocation_campaignId_state_idx" ON "CampaignDiscoveredLocation"("campaignId", "state");

-- CreateIndex
CREATE INDEX "UserDiscoveredLocation_locationId_idx" ON "UserDiscoveredLocation"("locationId");

-- CreateIndex
CREATE INDEX "UserDiscoveredLocation_userId_state_idx" ON "UserDiscoveredLocation"("userId", "state");

-- CreateIndex
CREATE INDEX "UserDiscoveredEdge_edgeId_idx" ON "UserDiscoveredEdge"("edgeId");

-- CreateIndex
CREATE INDEX "CampaignEdgeDiscovery_campaignId_idx" ON "CampaignEdgeDiscovery"("campaignId");

-- CreateIndex
CREATE INDEX "WorldNpcKnownLocation_locationId_idx" ON "WorldNpcKnownLocation"("locationId");

-- CreateIndex
CREATE INDEX "CharacterClearedDungeon_dungeonId_idx" ON "CharacterClearedDungeon"("dungeonId");

-- CreateIndex
CREATE INDEX "CampaignQuestPrerequisite_prerequisiteId_idx" ON "CampaignQuestPrerequisite"("prerequisiteId");

-- AddForeignKey
ALTER TABLE "CampaignDiscoveredLocation" ADD CONSTRAINT "CampaignDiscoveredLocation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDiscoveredLocation" ADD CONSTRAINT "CampaignDiscoveredLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WorldLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDiscoveredLocation" ADD CONSTRAINT "UserDiscoveredLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserWorldKnowledge"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDiscoveredLocation" ADD CONSTRAINT "UserDiscoveredLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WorldLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDiscoveredEdge" ADD CONSTRAINT "UserDiscoveredEdge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserWorldKnowledge"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDiscoveredEdge" ADD CONSTRAINT "UserDiscoveredEdge_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "WorldLocationEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEdgeDiscovery" ADD CONSTRAINT "CampaignEdgeDiscovery_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "WorldLocationEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEdgeDiscovery" ADD CONSTRAINT "CampaignEdgeDiscovery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldNpcKnownLocation" ADD CONSTRAINT "WorldNpcKnownLocation_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "WorldNPC"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldNpcKnownLocation" ADD CONSTRAINT "WorldNpcKnownLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WorldLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClearedDungeon" ADD CONSTRAINT "CharacterClearedDungeon_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClearedDungeon" ADD CONSTRAINT "CharacterClearedDungeon_dungeonId_fkey" FOREIGN KEY ("dungeonId") REFERENCES "WorldLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignQuestPrerequisite" ADD CONSTRAINT "CampaignQuestPrerequisite_questId_fkey" FOREIGN KEY ("questId") REFERENCES "CampaignQuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignQuestPrerequisite" ADD CONSTRAINT "CampaignQuestPrerequisite_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "CampaignQuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
