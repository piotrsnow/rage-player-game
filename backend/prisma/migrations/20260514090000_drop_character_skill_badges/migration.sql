-- skillBadges was replaced by character badge summary fields and should not
-- remain on the Character model. IF EXISTS keeps local DBs that were already
-- pushed from the current schema from failing this migration.
ALTER TABLE "Character" DROP COLUMN IF EXISTS "skillBadges";
