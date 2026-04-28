/*
  Warnings:

  - You are about to drop the column `relationships` on the `CampaignNPC` table. All the data in the column will be lost.
  - You are about to drop the column `objectives` on the `CampaignQuest` table. All the data in the column will be lost.
  - You are about to drop the column `equipped` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `inventory` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `materialBag` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `skills` on the `Character` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CampaignNPC" DROP COLUMN "relationships";

-- AlterTable
ALTER TABLE "CampaignQuest" DROP COLUMN "objectives";

-- AlterTable
ALTER TABLE "Character" DROP COLUMN "equipped",
DROP COLUMN "inventory",
DROP COLUMN "materialBag",
DROP COLUMN "skills",
ADD COLUMN     "equippedArmour" TEXT,
ADD COLUMN     "equippedMainHand" TEXT,
ADD COLUMN     "equippedOffHand" TEXT;

-- CreateTable
CREATE TABLE "CharacterSkill" (
    "characterId" UUID NOT NULL,
    "skillName" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "cap" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "CharacterSkill_pkey" PRIMARY KEY ("characterId","skillName")
);

-- CreateTable
CREATE TABLE "CharacterInventoryItem" (
    "characterId" UUID NOT NULL,
    "itemKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "baseType" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "props" JSONB NOT NULL DEFAULT '{}',
    "imageUrl" TEXT,
    "addedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterInventoryItem_pkey" PRIMARY KEY ("characterId","itemKey")
);

-- CreateTable
CREATE TABLE "CharacterMaterial" (
    "characterId" UUID NOT NULL,
    "materialKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CharacterMaterial_pkey" PRIMARY KEY ("characterId","materialKey")
);

-- CreateTable
CREATE TABLE "CampaignNpcRelationship" (
    "id" BIGSERIAL NOT NULL,
    "campaignNpcId" UUID NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "strength" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignNpcRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignQuestObjective" (
    "id" BIGSERIAL NOT NULL,
    "questId" UUID NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "targetAmount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CampaignQuestObjective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterSkill_characterId_level_idx" ON "CharacterSkill"("characterId", "level");

-- CreateIndex
CREATE INDEX "CharacterInventoryItem_characterId_addedAt_idx" ON "CharacterInventoryItem"("characterId", "addedAt");

-- CreateIndex
CREATE INDEX "CampaignNpcRelationship_campaignNpcId_idx" ON "CampaignNpcRelationship"("campaignNpcId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignNpcRelationship_campaignNpcId_targetType_targetRef_key" ON "CampaignNpcRelationship"("campaignNpcId", "targetType", "targetRef");

-- CreateIndex
CREATE INDEX "CampaignQuestObjective_questId_displayOrder_idx" ON "CampaignQuestObjective"("questId", "displayOrder");

-- AddForeignKey
ALTER TABLE "CharacterSkill" ADD CONSTRAINT "CharacterSkill_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterInventoryItem" ADD CONSTRAINT "CharacterInventoryItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterMaterial" ADD CONSTRAINT "CharacterMaterial_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignNpcRelationship" ADD CONSTRAINT "CampaignNpcRelationship_campaignNpcId_fkey" FOREIGN KEY ("campaignNpcId") REFERENCES "CampaignNPC"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignQuestObjective" ADD CONSTRAINT "CampaignQuestObjective_questId_fkey" FOREIGN KEY ("questId") REFERENCES "CampaignQuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
