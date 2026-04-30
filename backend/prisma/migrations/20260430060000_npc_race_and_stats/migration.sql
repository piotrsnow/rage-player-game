-- AlterTable
ALTER TABLE "CampaignNPC"
  ADD COLUMN "race"         TEXT,
  ADD COLUMN "creatureKind" TEXT,
  ADD COLUMN "level"        INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "stats"        JSONB   NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "WorldNPC"
  ADD COLUMN "race"         TEXT,
  ADD COLUMN "creatureKind" TEXT,
  ADD COLUMN "level"        INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "stats"        JSONB   NOT NULL DEFAULT '{}';
