-- CustomSpell: migrate from name-as-PK to UUID PK with name as @unique.
-- Backfill existing rows with gen_random_uuid() so no data is lost.

ALTER TABLE "CustomSpell" ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE "CustomSpell" DROP CONSTRAINT "CustomSpell_pkey";

ALTER TABLE "CustomSpell" ADD CONSTRAINT "CustomSpell_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "CustomSpell_name_key" ON "CustomSpell"("name");
