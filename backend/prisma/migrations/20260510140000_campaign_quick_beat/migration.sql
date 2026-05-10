-- Mała akcja (quick beat) — lightweight RP-beat anchored to a CampaignScene.
-- Does NOT bump sceneIndex; nano-generated narration appended to chatHistory
-- and persisted here so the chat survives reload. No embedding/post-scene work.
CREATE TABLE "CampaignQuickBeat" (
  "id"               UUID NOT NULL,
  "campaignId"       UUID NOT NULL,
  "parentSceneIndex" INTEGER NOT NULL,
  "characterId"      UUID,
  "playerAction"     TEXT NOT NULL,
  "narrationText"    TEXT NOT NULL,
  "npcSpeaker"       TEXT,
  "npcReply"         TEXT,
  "timeAdvance"      DOUBLE PRECISION,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CampaignQuickBeat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignQuickBeat_campaignId_createdAt_idx"
  ON "CampaignQuickBeat"("campaignId", "createdAt");

ALTER TABLE "CampaignQuickBeat"
  ADD CONSTRAINT "CampaignQuickBeat_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
