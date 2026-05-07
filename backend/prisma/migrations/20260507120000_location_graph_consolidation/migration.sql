-- Faza 0 — Konsolidacja systemów lokalizacji do Location Graph.
-- Rozszerza WorldLocation/CampaignLocation o pola potrzebne by graf był
-- jedynym źródłem prawdy. Usuwa legacy string columns (currentLocationName,
-- lastLocation). CampaignQuest dostaje polymorphic locationKind. WorldEvent
-- dostaje polymorphic locationKind/locationId.
--
-- Decyzja: clean-slate. Stare zapisy nie wspierane (loader rzuca błąd).
-- Nie ma backfill ze stringów — kolumny ustawione na default i NULL.

-- ── WorldLocation: nowe pola metadane ─────────────────────────────────
ALTER TABLE "WorldLocation"
  ADD COLUMN "tacticalGrid"     JSONB,
  ADD COLUMN "biome"            TEXT,
  ADD COLUMN "anchorType"       TEXT,
  ADD COLUMN "visitCount"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "npcsEncountered"  JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "modificationsLog" JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "dungeonState"     JSONB,
  ADD COLUMN "liberatedAt"      TIMESTAMPTZ;

-- ── CampaignLocation: nowe pola metadane (lustro WorldLocation) ───────
ALTER TABLE "CampaignLocation"
  ADD COLUMN "tacticalGrid"     JSONB,
  ADD COLUMN "biome"            TEXT,
  ADD COLUMN "anchorType"       TEXT,
  ADD COLUMN "visitCount"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "npcsEncountered"  JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "modificationsLog" JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "dungeonState"     JSONB,
  ADD COLUMN "liberatedAt"      TIMESTAMPTZ;

-- ── Campaign.currentLocationName: NIE usuwamy w Fazie 0 ───────────────
-- (deprecated, ale zachowane dla callsite'ów do czasu Fazy 3a). Usunięcie
-- + BE cleanup w osobnej migracji w Fazie 3a.
--
-- ── CampaignNPC.lastLocation: NIE usuwamy w Fazie 0 ───────────────────
-- (deprecated, callsite'y w campaignSync/intentClassifier/aiContextTools).
-- Usunięcie + BE cleanup w Fazie 3a.

-- ── CampaignQuest: locationId staje się composite ref (kind+id) ───────
-- locationId zostaje w schema ale teraz musi być parą z locationKind.
ALTER TABLE "CampaignQuest"
  ADD COLUMN "locationKind" TEXT;

-- ── WorldEvent: dodajemy polymorphic location ref ─────────────────────
-- Legacy worldLocationId zostaje (canonical-only); nowe locationKind/Id
-- pokrywa również CampaignLocation.
ALTER TABLE "WorldEvent"
  ADD COLUMN "locationKind" TEXT,
  ADD COLUMN "locationId"   UUID;

CREATE INDEX "WorldEvent_locationKind_locationId_createdAt_idx"
  ON "WorldEvent" ("locationKind", "locationId", "createdAt");

-- ── Validation constraints ────────────────────────────────────────────
-- locationKind musi być 'world' lub 'campaign' (jeśli ustawione).
-- Campaign + CampaignNPC już mają check constraints na xxLocationKind ('world'|'campaign')
-- z migracji F5b — nie duplikujemy. Dodajemy tylko dla nowych pól.

ALTER TABLE "CampaignQuest"
  ADD CONSTRAINT "CampaignQuest_locationKind_check"
  CHECK ("locationKind" IS NULL OR "locationKind" IN ('world', 'campaign'));

ALTER TABLE "WorldEvent"
  ADD CONSTRAINT "WorldEvent_locationKind_check"
  CHECK ("locationKind" IS NULL OR "locationKind" IN ('world', 'campaign'));

-- ── Note: Road table NOT dropped here. Migration to LocationEdge happens
-- in Faza 4.5 via one-shot dev script `migrate-roads-to-edges.js`. Road
-- table will be dropped in Faza 8 after all callsites are off it.
