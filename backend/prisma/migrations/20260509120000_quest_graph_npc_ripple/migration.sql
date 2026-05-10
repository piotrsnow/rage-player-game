-- Quest graph + NPC ripple + diegetic discovery — narrative overhaul fundamentu.
-- Rozdziela mechaniczne unlock (parents satisfied) od diegetycznego discovery
-- (NPC explicitly told player). Wprowadza graf questa via metadata + nodeKey.
-- Wszystkie kolumny nullable / defaulted — zero breaking change na poziomie odczytu.

-- Oś 1 — branching graf
ALTER TABLE "CampaignQuestObjective" ADD COLUMN IF NOT EXISTS "nodeKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignQuestObjective_questId_nodeKey_key"
  ON "CampaignQuestObjective"("questId", "nodeKey")
  WHERE "nodeKey" IS NOT NULL;

-- Oś 4 — quest mutation log (stalled/failed/reroute audit trail)
ALTER TABLE "CampaignQuest" ADD COLUMN IF NOT EXISTS "mutationLog" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Oś 2 — NPC relationship ripple strength (kierunkowe natężenie wpływu)
-- Backfill: |strength| skalowany do 0..100. ABS(strength) zazwyczaj 0..100,
-- ale klamp dla bezpieczeństwa.
ALTER TABLE "CampaignNpcRelationship" ADD COLUMN IF NOT EXISTS "rippleStrength" INTEGER NOT NULL DEFAULT 50;
UPDATE "CampaignNpcRelationship"
  SET "rippleStrength" = LEAST(100, GREATEST(0, ABS("strength")))
  WHERE "rippleStrength" = 50;

-- Feature flag — nowe kampanie dostają graf, stare zostają na liniowych questach
-- aż do opt-in upgrade'u przez admin endpoint.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "questGraphEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Oś 5 — diegetic discovery backfill: legacy objectives (bez `discovered` w metadata)
-- ustawione na true, żeby UI nie ukrył istniejących questów w starych kampaniach.
-- Nowe objectives z grafu emitują metadata.discovered=false explicit.
UPDATE "CampaignQuestObjective"
  SET "metadata" = jsonb_set("metadata", '{discovered}', 'true'::jsonb)
  WHERE NOT ("metadata" ? 'discovered');
