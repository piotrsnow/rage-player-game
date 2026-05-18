-- Inventory: hidden flag + lineage (composedFrom) for combine/enchant/discard flows.
--
-- Discard, combine, and enchant all soft-hide rows (instead of deleting) so:
--  * lineage chips survive on the result item even after sources are gone
--  * undo/audit could be added later without backfill
--  * snapshot save (which deletes visible rows + re-creates) leaves hidden rows alone
--
-- composedFrom stores `[{ itemKey, name, rarity, kind: 'combine_source'|'enchant_source', spell? }, ...]`.

ALTER TABLE "CharacterInventoryItem"
  ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hiddenReason" TEXT,
  ADD COLUMN "hiddenAt" TIMESTAMPTZ,
  ADD COLUMN "composedFrom" JSONB;

CREATE INDEX "CharacterInventoryItem_characterId_hidden_idx"
  ON "CharacterInventoryItem"("characterId", "hidden");
