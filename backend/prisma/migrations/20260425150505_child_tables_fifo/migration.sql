/*
  Warnings:

  - You are about to drop the column `dmMemory` on the `CampaignDmAgent` table. All the data in the column will be lost.
  - You are about to drop the column `pendingHooks` on the `CampaignDmAgent` table. All the data in the column will be lost.
  - You are about to drop the column `experienceLog` on the `CampaignNPC` table. All the data in the column will be lost.
  - You are about to drop the column `knowledgeBase` on the `WorldLocation` table. All the data in the column will be lost.
  - You are about to drop the column `dialogHistory` on the `WorldNPC` table. All the data in the column will be lost.
  - You are about to drop the column `knowledgeBase` on the `WorldNPC` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CampaignDmAgent" DROP COLUMN "dmMemory",
DROP COLUMN "pendingHooks";

-- AlterTable
ALTER TABLE "CampaignNPC" DROP COLUMN "experienceLog";

-- AlterTable
ALTER TABLE "WorldLocation" DROP COLUMN "knowledgeBase";

-- AlterTable
ALTER TABLE "WorldNPC" DROP COLUMN "dialogHistory",
DROP COLUMN "knowledgeBase";

-- CreateTable
CREATE TABLE "CampaignNpcExperience" (
    "id" BIGSERIAL NOT NULL,
    "campaignNpcId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "importance" TEXT,
    "sceneIndex" INTEGER,
    "addedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignNpcExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDmMemoryEntry" (
    "id" BIGSERIAL NOT NULL,
    "campaignId" UUID NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plannedFor" TEXT,
    "status" TEXT,
    "summary" TEXT NOT NULL,

    CONSTRAINT "CampaignDmMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDmPendingHook" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'generic',
    "summary" TEXT NOT NULL,
    "idealTiming" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignDmPendingHook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldNpcKnowledge" (
    "id" BIGSERIAL NOT NULL,
    "npcId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "importance" TEXT,
    "confidence" DOUBLE PRECISION,
    "similarity" DOUBLE PRECISION,
    "sensitivity" TEXT,
    "addedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "learnedAt" TIMESTAMPTZ,

    CONSTRAINT "WorldNpcKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldNpcDialogTurn" (
    "id" BIGSERIAL NOT NULL,
    "npcId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "playerMsg" TEXT NOT NULL,
    "npcResponse" TEXT NOT NULL,
    "emote" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldNpcDialogTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldLocationKnowledge" (
    "id" BIGSERIAL NOT NULL,
    "locationId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "similarity" DOUBLE PRECISION,
    "addedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldLocationKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignNpcExperience_campaignNpcId_addedAt_idx" ON "CampaignNpcExperience"("campaignNpcId", "addedAt");

-- CreateIndex
CREATE INDEX "CampaignDmMemoryEntry_campaignId_at_idx" ON "CampaignDmMemoryEntry"("campaignId", "at");

-- CreateIndex
CREATE INDEX "CampaignDmPendingHook_campaignId_createdAt_idx" ON "CampaignDmPendingHook"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldNpcKnowledge_npcId_addedAt_idx" ON "WorldNpcKnowledge"("npcId", "addedAt");

-- CreateIndex
CREATE INDEX "WorldNpcDialogTurn_npcId_campaignId_createdAt_idx" ON "WorldNpcDialogTurn"("npcId", "campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldLocationKnowledge_locationId_addedAt_idx" ON "WorldLocationKnowledge"("locationId", "addedAt");

-- AddForeignKey
ALTER TABLE "CampaignNpcExperience" ADD CONSTRAINT "CampaignNpcExperience_campaignNpcId_fkey" FOREIGN KEY ("campaignNpcId") REFERENCES "CampaignNPC"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDmMemoryEntry" ADD CONSTRAINT "CampaignDmMemoryEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignDmAgent"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDmPendingHook" ADD CONSTRAINT "CampaignDmPendingHook_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CampaignDmAgent"("campaignId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldNpcKnowledge" ADD CONSTRAINT "WorldNpcKnowledge_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "WorldNPC"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldNpcDialogTurn" ADD CONSTRAINT "WorldNpcDialogTurn_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "WorldNPC"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldNpcDialogTurn" ADD CONSTRAINT "WorldNpcDialogTurn_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldLocationKnowledge" ADD CONSTRAINT "WorldLocationKnowledge_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WorldLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════
-- F2 — FIFO trim triggers (newest-keep, oldest-drop on overflow).
-- One AFTER-INSERT trigger per child table; cap matches app-level constants.
-- Tie-break on id when addedAt/createdAt collide (e.g. seed batches).
-- ═══════════════════════════════════════════════════════════════════════

-- WorldNpcKnowledge: cap 50 per npcId
CREATE OR REPLACE FUNCTION trim_world_npc_knowledge() RETURNS trigger AS $$
BEGIN
  DELETE FROM "WorldNpcKnowledge"
  WHERE "npcId" = NEW."npcId"
    AND "id" IN (
      SELECT "id" FROM "WorldNpcKnowledge"
      WHERE "npcId" = NEW."npcId"
      ORDER BY "addedAt" DESC, "id" DESC
      OFFSET 50
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trim_world_npc_knowledge_tr
AFTER INSERT ON "WorldNpcKnowledge"
FOR EACH ROW EXECUTE FUNCTION trim_world_npc_knowledge();

-- WorldNpcDialogTurn: cap 50 per (npcId, campaignId)
CREATE OR REPLACE FUNCTION trim_world_npc_dialog() RETURNS trigger AS $$
BEGIN
  DELETE FROM "WorldNpcDialogTurn"
  WHERE "npcId" = NEW."npcId" AND "campaignId" = NEW."campaignId"
    AND "id" IN (
      SELECT "id" FROM "WorldNpcDialogTurn"
      WHERE "npcId" = NEW."npcId" AND "campaignId" = NEW."campaignId"
      ORDER BY "createdAt" DESC, "id" DESC
      OFFSET 50
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trim_world_npc_dialog_tr
AFTER INSERT ON "WorldNpcDialogTurn"
FOR EACH ROW EXECUTE FUNCTION trim_world_npc_dialog();

-- WorldLocationKnowledge: cap 50 per locationId
CREATE OR REPLACE FUNCTION trim_world_location_knowledge() RETURNS trigger AS $$
BEGIN
  DELETE FROM "WorldLocationKnowledge"
  WHERE "locationId" = NEW."locationId"
    AND "id" IN (
      SELECT "id" FROM "WorldLocationKnowledge"
      WHERE "locationId" = NEW."locationId"
      ORDER BY "addedAt" DESC, "id" DESC
      OFFSET 50
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trim_world_location_knowledge_tr
AFTER INSERT ON "WorldLocationKnowledge"
FOR EACH ROW EXECUTE FUNCTION trim_world_location_knowledge();

-- CampaignNpcExperience: cap 20 per campaignNpcId (matches MAX_LOG_ENTRIES_PER_NPC)
CREATE OR REPLACE FUNCTION trim_campaign_npc_experience() RETURNS trigger AS $$
BEGIN
  DELETE FROM "CampaignNpcExperience"
  WHERE "campaignNpcId" = NEW."campaignNpcId"
    AND "id" IN (
      SELECT "id" FROM "CampaignNpcExperience"
      WHERE "campaignNpcId" = NEW."campaignNpcId"
      ORDER BY "addedAt" DESC, "id" DESC
      OFFSET 20
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trim_campaign_npc_experience_tr
AFTER INSERT ON "CampaignNpcExperience"
FOR EACH ROW EXECUTE FUNCTION trim_campaign_npc_experience();

-- CampaignDmMemoryEntry: cap 20 per campaignId (matches DM_MEMORY_CAP)
CREATE OR REPLACE FUNCTION trim_campaign_dm_memory() RETURNS trigger AS $$
BEGIN
  DELETE FROM "CampaignDmMemoryEntry"
  WHERE "campaignId" = NEW."campaignId"
    AND "id" IN (
      SELECT "id" FROM "CampaignDmMemoryEntry"
      WHERE "campaignId" = NEW."campaignId"
      ORDER BY "at" DESC, "id" DESC
      OFFSET 20
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trim_campaign_dm_memory_tr
AFTER INSERT ON "CampaignDmMemoryEntry"
FOR EACH ROW EXECUTE FUNCTION trim_campaign_dm_memory();

-- CampaignDmPendingHook: cap 12 per campaignId, FIFO newest-keep
-- (priority is metadata, not a trim ranker — matches clampList semantics)
CREATE OR REPLACE FUNCTION trim_campaign_dm_hooks() RETURNS trigger AS $$
BEGIN
  DELETE FROM "CampaignDmPendingHook"
  WHERE "campaignId" = NEW."campaignId"
    AND "id" IN (
      SELECT "id" FROM "CampaignDmPendingHook"
      WHERE "campaignId" = NEW."campaignId"
      ORDER BY "createdAt" DESC, "id" DESC
      OFFSET 12
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trim_campaign_dm_hooks_tr
AFTER INSERT ON "CampaignDmPendingHook"
FOR EACH ROW EXECUTE FUNCTION trim_campaign_dm_hooks();
