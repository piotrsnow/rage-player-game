-- CustomSpell: create table if it doesn't exist yet (was previously only
-- created via `prisma db push`), then migrate from name-as-PK to UUID PK
-- with name as @unique.  Backfill existing rows with gen_random_uuid().

CREATE TABLE IF NOT EXISTS "CustomSpell" (
    "name"        TEXT NOT NULL,
    "school"      TEXT,
    "description" TEXT,
    "icon"        TEXT,
    "manaCost"    INTEGER NOT NULL DEFAULT 2,
    "createdById" UUID,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "CustomSpell_pkey" PRIMARY KEY ("name"),
    CONSTRAINT "CustomSpell_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "CustomSpell" ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE "CustomSpell" DROP CONSTRAINT "CustomSpell_pkey";

ALTER TABLE "CustomSpell" ADD CONSTRAINT "CustomSpell_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "CustomSpell_name_key" ON "CustomSpell"("name");
