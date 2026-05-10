-- Add NPC appearance + dialect fields. Both nullable; backfilled lazily on
-- next portrait/dialog generation, then re-used as the canonical source.

ALTER TABLE "WorldNPC"    ADD COLUMN "appearance" TEXT;
ALTER TABLE "WorldNPC"    ADD COLUMN "dialect"    TEXT;

ALTER TABLE "CampaignNPC" ADD COLUMN "appearance" TEXT;
ALTER TABLE "CampaignNPC" ADD COLUMN "dialect"    TEXT;
