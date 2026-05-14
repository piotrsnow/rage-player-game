-- AlterTable
ALTER TABLE "Character" ADD COLUMN "chargenAppearance" JSONB,
ADD COLUMN "spriteSheetUrl" TEXT;

-- AlterTable
ALTER TABLE "WorldNPC" ADD COLUMN "chargenAppearance" JSONB,
ADD COLUMN "spriteSheetUrl" TEXT;

-- AlterTable
ALTER TABLE "CampaignNPC" ADD COLUMN "chargenAppearance" JSONB,
ADD COLUMN "spriteSheetUrl" TEXT;
