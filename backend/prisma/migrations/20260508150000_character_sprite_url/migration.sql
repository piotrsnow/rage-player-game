-- PixelLab map-token sprites for location graph / admin canon (distinct from portraitUrl).
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "spriteUrl" TEXT;
ALTER TABLE "CampaignNPC" ADD COLUMN IF NOT EXISTS "spriteUrl" TEXT;
ALTER TABLE "WorldNPC" ADD COLUMN IF NOT EXISTS "spriteUrl" TEXT;
