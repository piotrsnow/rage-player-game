-- Unified Entity Tables Migration
-- Merges WorldNPC+CampaignNPC into "Npc" and WorldLocation+CampaignLocation into "Location"
-- Eliminates polymorphic kind+id patterns in favor of plain FK references.

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 1: Create new unified tables
-- ═══════════════════════════════════════════════════════════════════════

-- 1a. Unified Location table
CREATE TABLE "Location" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaignId" UUID,
  "canonicalName" TEXT,
  "displayName" TEXT,
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT 'generic',
  "region" TEXT,
  "parentLocationId" UUID,
  "locationType" "LocationType" NOT NULL DEFAULT 'generic',
  "slotType" TEXT,
  "slotKind" TEXT NOT NULL DEFAULT 'custom',
  "maxKeyNpcs" INTEGER NOT NULL DEFAULT 10,
  "maxSubLocations" INTEGER NOT NULL DEFAULT 5,
  "regionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "regionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "positionConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "subGridX" INTEGER,
  "subGridY" INTEGER,
  "knownByDefault" BOOLEAN NOT NULL DEFAULT false,
  "dangerLevel" "DangerLevel" NOT NULL DEFAULT 'safe',
  "globallyActive" BOOLEAN NOT NULL DEFAULT true,
  "softDeletedAt" TIMESTAMPTZ,
  "originCampaignId" UUID,
  "aliases" JSONB NOT NULL DEFAULT '[]',
  "roomMetadata" JSONB,
  "tags" JSONB NOT NULL DEFAULT '[]',
  "atmosphere" TEXT,
  "narrativeRoles" JSONB NOT NULL DEFAULT '[]',
  "scale" INTEGER NOT NULL DEFAULT 5,
  "nodeShape" TEXT,
  "nodeIcon" TEXT,
  "nodeImageUrl" TEXT,
  "tacticalGrid" JSONB,
  "biome" TEXT,
  "anchorType" TEXT,
  "visitCount" INTEGER NOT NULL DEFAULT 0,
  "npcsEncountered" JSONB NOT NULL DEFAULT '[]',
  "modificationsLog" JSONB NOT NULL DEFAULT '[]',
  "dungeonState" JSONB,
  "liberatedAt" TIMESTAMPTZ,
  "embeddingText" TEXT,
  "embedding" vector(1536),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- 1b. Unified Npc table
CREATE TABLE "Npc" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaignId" UUID,
  "canonicalId" TEXT,
  "canonicalNpcId" UUID,
  "npcId" TEXT,
  "name" TEXT NOT NULL,
  "gender" TEXT NOT NULL DEFAULT 'unknown',
  "role" TEXT,
  "personality" TEXT,
  "alignment" TEXT NOT NULL DEFAULT 'neutral',
  "alive" BOOLEAN NOT NULL DEFAULT true,
  "disposition" INTEGER NOT NULL DEFAULT 0,
  "category" TEXT NOT NULL DEFAULT 'commoner',
  "factionId" TEXT,
  "notes" TEXT,
  "currentLocationId" UUID,
  "homeLocationId" UUID,
  "lastLocation" TEXT,
  "isAgent" BOOLEAN NOT NULL DEFAULT false,
  "activeGoal" TEXT,
  "goalProgress" JSONB,
  "schedule" JSONB,
  "lastTickAt" TIMESTAMPTZ,
  "tickIntervalHours" INTEGER NOT NULL DEFAULT 24,
  "lastTickSceneIndex" INTEGER,
  "tickIntervalScenes" INTEGER NOT NULL DEFAULT 2,
  "goalDeadlineAt" TIMESTAMPTZ,
  "lastLocationPingAt" TIMESTAMPTZ,
  "keyNpc" BOOLEAN NOT NULL DEFAULT true,
  "pausedAt" TIMESTAMPTZ,
  "pauseSnapshot" JSONB,
  "companionOfCampaignId" UUID,
  "companionJoinedAt" TIMESTAMPTZ,
  "companionLoyalty" INTEGER NOT NULL DEFAULT 50,
  "lockedByCampaignId" UUID,
  "lockedAt" TIMESTAMPTZ,
  "lockedSnapshot" JSONB,
  "pendingIntroHint" TEXT,
  "hasAcknowledgedFame" BOOLEAN NOT NULL DEFAULT false,
  "interactionCount" INTEGER NOT NULL DEFAULT 0,
  "dialogCharCount" INTEGER NOT NULL DEFAULT 0,
  "questInvolvementCount" INTEGER NOT NULL DEFAULT 0,
  "lastInteractionAt" TIMESTAMPTZ,
  "lastInteractionSceneIndex" INTEGER,
  "race" TEXT,
  "creatureKind" TEXT,
  "level" INTEGER NOT NULL DEFAULT 1,
  "stats" JSONB NOT NULL DEFAULT '{}',
  "portraitUrl" TEXT,
  "spriteUrl" TEXT,
  "chargenAppearance" JSONB,
  "spriteSheetUrl" TEXT,
  "appearance" TEXT,
  "dialect" TEXT,
  "globallyActive" BOOLEAN NOT NULL DEFAULT true,
  "softDeletedAt" TIMESTAMPTZ,
  "originCampaignId" UUID,
  "embeddingText" TEXT,
  "embedding" vector(1536),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "Npc_pkey" PRIMARY KEY ("id")
);

-- 1c. NpcKnowledge (merges WorldNpcKnowledge)
CREATE TABLE "NpcKnowledge" (
  "id" BIGSERIAL NOT NULL,
  "npcId" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "importance" TEXT,
  "confidence" DOUBLE PRECISION,
  "similarity" DOUBLE PRECISION,
  "sensitivity" TEXT,
  "sceneIndex" INTEGER,
  "addedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "learnedAt" TIMESTAMPTZ,

  CONSTRAINT "NpcKnowledge_pkey" PRIMARY KEY ("id")
);

-- 1d. NpcExperience (replaces CampaignNpcExperience)
CREATE TABLE "NpcExperience" (
  "id" BIGSERIAL NOT NULL,
  "npcId" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "importance" TEXT,
  "sceneIndex" INTEGER,
  "addedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "NpcExperience_pkey" PRIMARY KEY ("id")
);

-- 1e. NpcRelationship (replaces CampaignNpcRelationship)
CREATE TABLE "NpcRelationship" (
  "id" BIGSERIAL NOT NULL,
  "npcId" UUID NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetRef" TEXT NOT NULL,
  "relation" TEXT NOT NULL,
  "strength" INTEGER NOT NULL DEFAULT 0,
  "rippleStrength" INTEGER NOT NULL DEFAULT 50,

  CONSTRAINT "NpcRelationship_pkey" PRIMARY KEY ("id")
);

-- 1f. NpcLocationMovement (replaces CampaignNpcLocationMovement)
CREATE TABLE "NpcLocationMovement" (
  "id" BIGSERIAL NOT NULL,
  "npcId" UUID NOT NULL,
  "fromId" UUID,
  "toId" UUID NOT NULL,
  "source" TEXT NOT NULL,
  "sceneIndex" INTEGER,
  "movedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "NpcLocationMovement_pkey" PRIMARY KEY ("id")
);

-- 1g. NpcDialogTurn (replaces WorldNpcDialogTurn)
CREATE TABLE "NpcDialogTurn" (
  "id" BIGSERIAL NOT NULL,
  "npcId" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "playerMsg" TEXT NOT NULL,
  "npcResponse" TEXT NOT NULL,
  "emote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "NpcDialogTurn_pkey" PRIMARY KEY ("id")
);

-- 1h. NpcAttribution (replaces WorldNpcAttribution)
CREATE TABLE "NpcAttribution" (
  "id" BIGSERIAL NOT NULL,
  "npcId" UUID NOT NULL,
  "actorCharacterId" UUID NOT NULL,
  "actorCampaignId" UUID NOT NULL,
  "actionType" TEXT NOT NULL,
  "justified" BOOLEAN NOT NULL DEFAULT false,
  "justificationRaw" TEXT,
  "sceneIndex" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "NpcAttribution_pkey" PRIMARY KEY ("id")
);

-- 1i. NpcKnownLocation (replaces WorldNpcKnownLocation)
CREATE TABLE "NpcKnownLocation" (
  "npcId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "grantedBy" TEXT NOT NULL DEFAULT 'seed',
  "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "NpcKnownLocation_pkey" PRIMARY KEY ("npcId", "locationId")
);

-- 1j. LocationKnowledge (replaces WorldLocationKnowledge)
CREATE TABLE "LocationKnowledge" (
  "id" BIGSERIAL NOT NULL,
  "locationId" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "similarity" DOUBLE PRECISION,
  "addedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "LocationKnowledge_pkey" PRIMARY KEY ("id")
);

-- 1k. DiscoveredLocation (replaces CampaignDiscoveredLocation — no locationKind)
CREATE TABLE "DiscoveredLocation" (
  "campaignId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "state" "DiscoveryState" NOT NULL,
  "discoveredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "DiscoveredLocation_pkey" PRIMARY KEY ("campaignId", "locationId")
);

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 2: Copy data from old tables into new unified tables
-- ═══════════════════════════════════════════════════════════════════════

-- 2a. Copy WorldLocation → Location (canonical, campaignId = NULL)
INSERT INTO "Location" (
  "id", "campaignId", "canonicalName", "displayName", "description", "category",
  "region", "parentLocationId", "locationType", "slotType", "slotKind",
  "maxKeyNpcs", "maxSubLocations", "regionX", "regionY", "positionConfidence",
  "subGridX", "subGridY", "knownByDefault", "dangerLevel",
  "globallyActive", "softDeletedAt", "originCampaignId",
  "aliases", "roomMetadata", "tags", "atmosphere", "narrativeRoles", "scale",
  "nodeShape", "nodeIcon", "nodeImageUrl",
  "tacticalGrid", "biome", "anchorType", "visitCount", "npcsEncountered",
  "modificationsLog", "dungeonState", "liberatedAt",
  "embeddingText", "embedding", "createdAt", "updatedAt"
)
SELECT
  "id", NULL, "canonicalName", "displayName", "description", "category",
  "region", "parentLocationId", "locationType", "slotType", "slotKind",
  "maxKeyNpcs", "maxSubLocations", "regionX", "regionY", "positionConfidence",
  "subGridX", "subGridY", "knownByDefault", "dangerLevel",
  true, NULL, NULL,
  "aliases", "roomMetadata", "tags", "atmosphere", "narrativeRoles", "scale",
  "nodeShape", "nodeIcon", NULL,
  "tacticalGrid", "biome", "anchorType", "visitCount", "npcsEncountered",
  "modificationsLog", "dungeonState", "liberatedAt",
  "embeddingText", "embedding", "createdAt", "updatedAt"
FROM "WorldLocation";

-- 2b. Copy CampaignLocation → Location (campaign-scoped)
INSERT INTO "Location" (
  "id", "campaignId", "canonicalName", "displayName", "description", "category",
  "region", "parentLocationId", "locationType", "slotType", "slotKind",
  "maxKeyNpcs", "maxSubLocations", "regionX", "regionY", "positionConfidence",
  "subGridX", "subGridY", "knownByDefault", "dangerLevel",
  "globallyActive", "softDeletedAt", "originCampaignId",
  "aliases", "roomMetadata", "tags", "atmosphere", "narrativeRoles", "scale",
  "nodeShape", "nodeIcon", "nodeImageUrl",
  "tacticalGrid", "biome", "anchorType", "visitCount", "npcsEncountered",
  "modificationsLog", "dungeonState", "liberatedAt",
  "embeddingText", "embedding", "createdAt", "updatedAt"
)
SELECT
  "id", "campaignId", "canonicalSlug", "name", "description", "category",
  "region",
  -- parentLocationId: if parentLocationKind='campaign' use parentLocationId directly (same table now)
  -- if parentLocationKind='world' use parentLocationId directly (also same table)
  -- both IDs are preserved as-is since we copied WorldLocation IDs unchanged
  "parentLocationId",
  "locationType", "slotType", "slotKind",
  "maxKeyNpcs", "maxSubLocations", "regionX", "regionY", "positionConfidence",
  "subGridX", "subGridY", false, "dangerLevel",
  true, NULL, "campaignId",
  "aliases", "roomMetadata", "tags", "atmosphere", "narrativeRoles", "scale",
  "nodeShape", "nodeIcon", NULL,
  "tacticalGrid", "biome", "anchorType", "visitCount", "npcsEncountered",
  "modificationsLog", "dungeonState", "liberatedAt",
  "embeddingText", "embedding", "createdAt", "updatedAt"
FROM "CampaignLocation";

-- 2c. Copy WorldNPC → Npc (canonical, campaignId = NULL)
INSERT INTO "Npc" (
  "id", "campaignId", "canonicalId", "canonicalNpcId", "npcId",
  "name", "gender", "role", "personality", "alignment", "alive",
  "disposition", "category", "factionId", "notes",
  "currentLocationId", "homeLocationId", "lastLocation",
  "isAgent", "activeGoal", "goalProgress", "schedule",
  "lastTickAt", "tickIntervalHours", "lastTickSceneIndex", "tickIntervalScenes",
  "goalDeadlineAt", "lastLocationPingAt", "keyNpc",
  "pausedAt", "pauseSnapshot",
  "companionOfCampaignId", "companionJoinedAt", "companionLoyalty",
  "lockedByCampaignId", "lockedAt", "lockedSnapshot",
  "pendingIntroHint", "hasAcknowledgedFame",
  "interactionCount", "dialogCharCount", "questInvolvementCount",
  "lastInteractionAt", "lastInteractionSceneIndex",
  "race", "creatureKind", "level", "stats",
  "portraitUrl", "spriteUrl", "chargenAppearance", "spriteSheetUrl",
  "appearance", "dialect",
  "globallyActive", "softDeletedAt", "originCampaignId",
  "embeddingText", "embedding", "createdAt", "updatedAt"
)
SELECT
  "id", NULL, "canonicalId", NULL, "canonicalId",
  "name", 'unknown', "role", "personality", "alignment", "alive",
  0, "category", NULL, NULL,
  "currentLocationId", "homeLocationId", NULL,
  true, "activeGoal", "goalProgress", "schedule",
  "lastTickAt", "tickIntervalHours", "lastTickSceneIndex", "tickIntervalScenes",
  "goalDeadlineAt", "lastLocationPingAt", "keyNpc",
  "pausedAt", "pauseSnapshot",
  "companionOfCampaignId", "companionJoinedAt", "companionLoyalty",
  "lockedByCampaignId", "lockedAt", "lockedSnapshot",
  NULL, false,
  0, 0, 0,
  NULL, NULL,
  "race", "creatureKind", "level", "stats",
  NULL, "spriteUrl", "chargenAppearance", "spriteSheetUrl",
  "appearance", "dialect",
  true, NULL, NULL,
  "embeddingText", "embedding", "createdAt", "updatedAt"
FROM "WorldNPC";

-- 2d. Copy CampaignNPC → Npc (campaign-scoped)
-- Resolve lastLocationId: use lastLocationId directly (both world and campaign IDs
-- are now in the same Location table with same UUIDs preserved).
INSERT INTO "Npc" (
  "id", "campaignId", "canonicalId", "canonicalNpcId", "npcId",
  "name", "gender", "role", "personality", "alignment", "alive",
  "disposition", "category", "factionId", "notes",
  "currentLocationId", "homeLocationId", "lastLocation",
  "isAgent", "activeGoal", "goalProgress",
  "pendingIntroHint", "hasAcknowledgedFame",
  "interactionCount", "dialogCharCount", "questInvolvementCount",
  "lastInteractionAt", "lastInteractionSceneIndex",
  "race", "creatureKind", "level", "stats",
  "portraitUrl", "spriteUrl", "chargenAppearance", "spriteSheetUrl",
  "appearance", "dialect",
  "globallyActive", "softDeletedAt", "originCampaignId",
  "embeddingText", "embedding", "createdAt", "updatedAt"
)
SELECT
  "id", "campaignId", NULL, "worldNpcId", "npcId",
  "name", "gender", "role", "personality", "attitude", "alive",
  "disposition", "category", "factionId", "notes",
  -- currentLocationId = lastLocationId (both kinds are now same table)
  "lastLocationId", NULL, "lastLocation",
  "isAgent", "activeGoal", "goalProgress",
  "pendingIntroHint", "hasAcknowledgedFame",
  "interactionCount", "dialogCharCount", "questInvolvementCount",
  "lastInteractionAt", "lastInteractionSceneIndex",
  "race", "creatureKind", "level", "stats",
  "portraitUrl", "spriteUrl", "chargenAppearance", "spriteSheetUrl",
  "appearance", "dialect",
  true, NULL, NULL,
  "embeddingText", "embedding", "createdAt", "updatedAt"
FROM "CampaignNPC";

-- 2e. Copy WorldNpcKnowledge → NpcKnowledge
INSERT INTO "NpcKnowledge" ("id", "npcId", "content", "source", "kind", "importance", "confidence", "similarity", "sensitivity", "addedAt", "learnedAt")
SELECT "id", "npcId", "content", "source", "kind", "importance", "confidence", "similarity", "sensitivity", "addedAt", "learnedAt"
FROM "WorldNpcKnowledge";

-- 2f. Copy CampaignNpcExperience → NpcExperience
INSERT INTO "NpcExperience" ("id", "npcId", "content", "importance", "sceneIndex", "addedAt")
SELECT "id", "campaignNpcId", "content", "importance", "sceneIndex", "addedAt"
FROM "CampaignNpcExperience";

-- 2g. Copy CampaignNpcRelationship → NpcRelationship
INSERT INTO "NpcRelationship" ("id", "npcId", "targetType", "targetRef", "relation", "strength", "rippleStrength")
SELECT "id", "campaignNpcId", "targetType", "targetRef", "relation", "strength", "rippleStrength"
FROM "CampaignNpcRelationship";

-- 2h. Copy CampaignNpcLocationMovement → NpcLocationMovement
-- Convert fromKind/fromId and toKind/toId to plain FK (IDs preserved in Location table)
INSERT INTO "NpcLocationMovement" ("id", "npcId", "fromId", "toId", "source", "sceneIndex", "movedAt")
SELECT "id", "campaignNpcId", "fromId"::uuid, "toId"::uuid, "source", "sceneIndex", "movedAt"
FROM "CampaignNpcLocationMovement";

-- 2i. Copy WorldNpcDialogTurn → NpcDialogTurn
INSERT INTO "NpcDialogTurn" ("id", "npcId", "campaignId", "playerMsg", "npcResponse", "emote", "createdAt")
SELECT "id", "npcId", "campaignId", "playerMsg", "npcResponse", "emote", "createdAt"
FROM "WorldNpcDialogTurn";

-- 2j. Copy WorldNpcAttribution → NpcAttribution
INSERT INTO "NpcAttribution" ("id", "npcId", "actorCharacterId", "actorCampaignId", "actionType", "justified", "justificationRaw", "sceneIndex", "createdAt")
SELECT "id", "worldNpcId", "actorCharacterId", "actorCampaignId", "actionType", "justified", "judgeReason", NULL, "createdAt"
FROM "WorldNpcAttribution";

-- 2k. Copy WorldNpcKnownLocation → NpcKnownLocation
INSERT INTO "NpcKnownLocation" ("npcId", "locationId", "grantedBy", "grantedAt")
SELECT "npcId", "locationId", "grantedBy", "grantedAt"
FROM "WorldNpcKnownLocation";

-- 2l. Copy WorldLocationKnowledge → LocationKnowledge
INSERT INTO "LocationKnowledge" ("id", "locationId", "content", "source", "kind", "confidence", "similarity", "addedAt")
SELECT "id", "locationId", "content", "source", "kind", "confidence", "similarity", "addedAt"
FROM "WorldLocationKnowledge";

-- 2m. Copy CampaignDiscoveredLocation → DiscoveredLocation
-- Both 'world' and 'campaign' locationIds are now in the same Location table
INSERT INTO "DiscoveredLocation" ("campaignId", "locationId", "state", "discoveredAt")
SELECT "campaignId", "locationId", "state", "discoveredAt"
FROM "CampaignDiscoveredLocation";

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 3: Update FK references in other tables to point to unified tables
-- ═══════════════════════════════════════════════════════════════════════

-- 3a. Campaign.currentLocationId — already uses UUIDs from WorldLocation/CampaignLocation,
-- both of which are now in Location with same IDs. Just drop currentLocationKind column later.

-- 3b. CampaignQuest.locationId — was TEXT, convert to UUID.
-- Null out any non-UUID values first, then cast.
ALTER TABLE "CampaignQuest" DROP COLUMN IF EXISTS "locationKind";
ALTER TABLE "CampaignQuest" DROP CONSTRAINT IF EXISTS "CampaignQuest_locationKind_check";
UPDATE "CampaignQuest" SET "locationId" = NULL
  WHERE "locationId" IS NOT NULL
  AND "locationId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE "CampaignQuest" ALTER COLUMN "locationId" TYPE UUID USING "locationId"::uuid;

-- 3c. CharacterClearedDungeon — drop dungeonKind, rename dungeonId
ALTER TABLE "CharacterClearedDungeon" DROP CONSTRAINT IF EXISTS "CharacterClearedDungeon_pkey";
ALTER TABLE "CharacterClearedDungeon" DROP COLUMN IF EXISTS "dungeonKind";
ALTER TABLE "CharacterClearedDungeon" ADD CONSTRAINT "CharacterClearedDungeon_pkey" PRIMARY KEY ("characterId", "dungeonId");

-- 3d. LocationEdge — drop fromKind/toKind, rename fromId/toId to fromLocationId/toLocationId
ALTER TABLE "LocationEdge" ADD COLUMN "fromLocationId" UUID;
ALTER TABLE "LocationEdge" ADD COLUMN "toLocationId" UUID;
UPDATE "LocationEdge" SET "fromLocationId" = "fromId"::uuid, "toLocationId" = "toId"::uuid;
ALTER TABLE "LocationEdge" ALTER COLUMN "fromLocationId" SET NOT NULL;
ALTER TABLE "LocationEdge" ALTER COLUMN "toLocationId" SET NOT NULL;
ALTER TABLE "LocationEdge" DROP COLUMN "fromKind";
ALTER TABLE "LocationEdge" DROP COLUMN "fromId";
ALTER TABLE "LocationEdge" DROP COLUMN "toKind";
ALTER TABLE "LocationEdge" DROP COLUMN "toId";

-- 3e. CampaignEdge — drop fromKind/toKind, rename fromId/toId
ALTER TABLE "CampaignEdge" ADD COLUMN "fromLocationId" UUID;
ALTER TABLE "CampaignEdge" ADD COLUMN "toLocationId" UUID;
UPDATE "CampaignEdge" SET "fromLocationId" = "fromId"::uuid, "toLocationId" = "toId"::uuid;
ALTER TABLE "CampaignEdge" ALTER COLUMN "fromLocationId" SET NOT NULL;
ALTER TABLE "CampaignEdge" ALTER COLUMN "toLocationId" SET NOT NULL;
-- Drop old unique constraint before dropping columns
ALTER TABLE "CampaignEdge" DROP CONSTRAINT IF EXISTS "CampaignEdge_campaignId_fromKind_fromId_toKind_toId_relatio_key";
ALTER TABLE "CampaignEdge" DROP COLUMN "fromKind";
ALTER TABLE "CampaignEdge" DROP COLUMN "fromId";
ALTER TABLE "CampaignEdge" DROP COLUMN "toKind";
ALTER TABLE "CampaignEdge" DROP COLUMN "toId";
-- Add new unique constraint
ALTER TABLE "CampaignEdge" ADD CONSTRAINT "CampaignEdge_campaignId_fromLocationId_toLocationId_relati_key"
  UNIQUE ("campaignId", "fromLocationId", "toLocationId", "relationType");

-- 3f. Campaign — drop currentLocationKind
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "currentLocationKind";

-- 3g. WorldEvent — drop locationKind, merge legacy columns into unified names
ALTER TABLE "WorldEvent" DROP COLUMN IF EXISTS "locationKind";
-- locationId already exists (added in location_graph_consolidation); merge worldLocationId into it
UPDATE "WorldEvent" SET "locationId" = "worldLocationId" WHERE "locationId" IS NULL AND "worldLocationId" IS NOT NULL;
ALTER TABLE "WorldEvent" DROP COLUMN IF EXISTS "worldLocationId";
-- npcId does NOT exist yet — just rename worldNpcId
ALTER TABLE "WorldEvent" RENAME COLUMN "worldNpcId" TO "npcId";

-- 3h. NPCPromotionCandidate — rename campaignNpcId → npcId
ALTER TABLE "NPCPromotionCandidate" RENAME COLUMN "campaignNpcId" TO "npcId";

-- 3i. LocationPromotionCandidate — drop sourceLocationKind
ALTER TABLE "LocationPromotionCandidate" DROP COLUMN IF EXISTS "sourceLocationKind";
-- Drop old unique constraint and add new one
ALTER TABLE "LocationPromotionCandidate" DROP CONSTRAINT IF EXISTS "LocationPromotionCandidate_campaignId_sourceLocationKind_so_key";
ALTER TABLE "LocationPromotionCandidate" ADD CONSTRAINT "LocationPromotionCandidate_campaignId_sourceLocationId_key"
  UNIQUE ("campaignId", "sourceLocationId");

-- 3j. LocationSpriteJobItem — conditionally drop nodeKind, rename nodeId → locationId
-- Table may not exist if never created via migration (was db-push only).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'LocationSpriteJobItem') THEN
    ALTER TABLE "LocationSpriteJobItem" DROP CONSTRAINT IF EXISTS "LocationSpriteJobItem_jobId_nodeKind_nodeId_key";
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'LocationSpriteJobItem' AND column_name = 'nodeKind') THEN
      ALTER TABLE "LocationSpriteJobItem" DROP COLUMN "nodeKind";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'LocationSpriteJobItem' AND column_name = 'nodeId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'LocationSpriteJobItem' AND column_name = 'locationId') THEN
      ALTER TABLE "LocationSpriteJobItem" RENAME COLUMN "nodeId" TO "locationId";
    END IF;
    ALTER TABLE "LocationSpriteJobItem" DROP CONSTRAINT IF EXISTS "LocationSpriteJobItem_jobId_locationId_key";
    ALTER TABLE "LocationSpriteJobItem" ADD CONSTRAINT "LocationSpriteJobItem_jobId_locationId_key"
      UNIQUE ("jobId", "locationId");
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 4: Add constraints and indexes to new tables
-- ═══════════════════════════════════════════════════════════════════════

-- Location indexes and constraints
CREATE UNIQUE INDEX "Location_canonicalName_key" ON "Location"("canonicalName") WHERE "canonicalName" IS NOT NULL AND "campaignId" IS NULL;
CREATE INDEX "Location_campaignId_idx" ON "Location"("campaignId");
CREATE INDEX "Location_region_idx" ON "Location"("region");
CREATE INDEX "Location_parentLocationId_idx" ON "Location"("parentLocationId");
CREATE INDEX "Location_locationType_idx" ON "Location"("locationType");
CREATE INDEX "Location_regionX_regionY_idx" ON "Location"("regionX", "regionY");
CREATE INDEX "Location_globallyActive_softDeletedAt_idx" ON "Location"("globallyActive", "softDeletedAt");

ALTER TABLE "Location" ADD CONSTRAINT "Location_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentLocationId_fkey"
  FOREIGN KEY ("parentLocationId") REFERENCES "Location"("id") ON DELETE SET NULL;

-- Npc indexes and constraints
CREATE UNIQUE INDEX "Npc_canonicalId_key" ON "Npc"("canonicalId") WHERE "canonicalId" IS NOT NULL;
CREATE UNIQUE INDEX "Npc_campaignId_npcId_key" ON "Npc"("campaignId", "npcId") WHERE "campaignId" IS NOT NULL AND "npcId" IS NOT NULL;
CREATE INDEX "Npc_campaignId_idx" ON "Npc"("campaignId");
CREATE INDEX "Npc_canonicalNpcId_idx" ON "Npc"("canonicalNpcId");
CREATE INDEX "Npc_campaignId_canonicalNpcId_idx" ON "Npc"("campaignId", "canonicalNpcId");
CREATE INDEX "Npc_currentLocationId_idx" ON "Npc"("currentLocationId");
CREATE INDEX "Npc_alive_idx" ON "Npc"("alive");
CREATE INDEX "Npc_companionOfCampaignId_idx" ON "Npc"("companionOfCampaignId");
CREATE INDEX "Npc_lockedByCampaignId_idx" ON "Npc"("lockedByCampaignId");
CREATE INDEX "Npc_globallyActive_softDeletedAt_idx" ON "Npc"("globallyActive", "softDeletedAt");

ALTER TABLE "Npc" ADD CONSTRAINT "Npc_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE;
ALTER TABLE "Npc" ADD CONSTRAINT "Npc_canonicalNpcId_fkey"
  FOREIGN KEY ("canonicalNpcId") REFERENCES "Npc"("id") ON DELETE SET NULL;
ALTER TABLE "Npc" ADD CONSTRAINT "Npc_currentLocationId_fkey"
  FOREIGN KEY ("currentLocationId") REFERENCES "Location"("id") ON DELETE SET NULL;
ALTER TABLE "Npc" ADD CONSTRAINT "Npc_homeLocationId_fkey"
  FOREIGN KEY ("homeLocationId") REFERENCES "Location"("id") ON DELETE SET NULL;

-- NpcKnowledge
CREATE INDEX "NpcKnowledge_npcId_addedAt_idx" ON "NpcKnowledge"("npcId", "addedAt");
ALTER TABLE "NpcKnowledge" ADD CONSTRAINT "NpcKnowledge_npcId_fkey"
  FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE CASCADE;

-- NpcExperience
CREATE INDEX "NpcExperience_npcId_addedAt_idx" ON "NpcExperience"("npcId", "addedAt");
ALTER TABLE "NpcExperience" ADD CONSTRAINT "NpcExperience_npcId_fkey"
  FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE CASCADE;

-- NpcRelationship
CREATE UNIQUE INDEX "NpcRelationship_npcId_targetType_targetRef_key" ON "NpcRelationship"("npcId", "targetType", "targetRef");
CREATE INDEX "NpcRelationship_npcId_idx" ON "NpcRelationship"("npcId");
ALTER TABLE "NpcRelationship" ADD CONSTRAINT "NpcRelationship_npcId_fkey"
  FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE CASCADE;

-- NpcLocationMovement
CREATE INDEX "NpcLocationMovement_npcId_movedAt_idx" ON "NpcLocationMovement"("npcId", "movedAt" DESC);
ALTER TABLE "NpcLocationMovement" ADD CONSTRAINT "NpcLocationMovement_npcId_fkey"
  FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE CASCADE;
ALTER TABLE "NpcLocationMovement" ADD CONSTRAINT "NpcLocationMovement_fromId_fkey"
  FOREIGN KEY ("fromId") REFERENCES "Location"("id") ON DELETE SET NULL;
ALTER TABLE "NpcLocationMovement" ADD CONSTRAINT "NpcLocationMovement_toId_fkey"
  FOREIGN KEY ("toId") REFERENCES "Location"("id") ON DELETE CASCADE;

-- NpcDialogTurn
CREATE INDEX "NpcDialogTurn_npcId_campaignId_createdAt_idx" ON "NpcDialogTurn"("npcId", "campaignId", "createdAt");
ALTER TABLE "NpcDialogTurn" ADD CONSTRAINT "NpcDialogTurn_npcId_fkey"
  FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE CASCADE;
ALTER TABLE "NpcDialogTurn" ADD CONSTRAINT "NpcDialogTurn_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE;

-- NpcAttribution
CREATE UNIQUE INDEX "NpcAttribution_npcId_actorCharacterId_actorCampaignId_acti_key"
  ON "NpcAttribution"("npcId", "actorCharacterId", "actorCampaignId", "actionType");
CREATE INDEX "NpcAttribution_npcId_createdAt_idx" ON "NpcAttribution"("npcId", "createdAt");
CREATE INDEX "NpcAttribution_actorCharacterId_idx" ON "NpcAttribution"("actorCharacterId");
CREATE INDEX "NpcAttribution_actorCampaignId_idx" ON "NpcAttribution"("actorCampaignId");
ALTER TABLE "NpcAttribution" ADD CONSTRAINT "NpcAttribution_npcId_fkey"
  FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE CASCADE;
ALTER TABLE "NpcAttribution" ADD CONSTRAINT "NpcAttribution_actorCharacterId_fkey"
  FOREIGN KEY ("actorCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE;
ALTER TABLE "NpcAttribution" ADD CONSTRAINT "NpcAttribution_actorCampaignId_fkey"
  FOREIGN KEY ("actorCampaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE;

-- NpcKnownLocation
CREATE INDEX "NpcKnownLocation_locationId_idx" ON "NpcKnownLocation"("locationId");
ALTER TABLE "NpcKnownLocation" ADD CONSTRAINT "NpcKnownLocation_npcId_fkey"
  FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE CASCADE;
ALTER TABLE "NpcKnownLocation" ADD CONSTRAINT "NpcKnownLocation_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE;

-- LocationKnowledge
CREATE INDEX "LocationKnowledge_locationId_addedAt_idx" ON "LocationKnowledge"("locationId", "addedAt");
ALTER TABLE "LocationKnowledge" ADD CONSTRAINT "LocationKnowledge_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE;

-- DiscoveredLocation
CREATE INDEX "DiscoveredLocation_locationId_idx" ON "DiscoveredLocation"("locationId");
CREATE INDEX "DiscoveredLocation_campaignId_state_idx" ON "DiscoveredLocation"("campaignId", "state");
ALTER TABLE "DiscoveredLocation" ADD CONSTRAINT "DiscoveredLocation_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE;
ALTER TABLE "DiscoveredLocation" ADD CONSTRAINT "DiscoveredLocation_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE;

-- Clean orphans before FK
UPDATE "Campaign" SET "currentLocationId" = NULL WHERE "currentLocationId" IS NOT NULL AND "currentLocationId" NOT IN (SELECT "id" FROM "Location");
-- Campaign.currentLocationId FK to Location
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_currentLocationId_fkey"
  FOREIGN KEY ("currentLocationId") REFERENCES "Location"("id") ON DELETE SET NULL;

-- Clean orphans before FK
UPDATE "CampaignQuest" SET "locationId" = NULL WHERE "locationId" IS NOT NULL AND "locationId" NOT IN (SELECT "id" FROM "Location");
-- CampaignQuest.locationId FK to Location
ALTER TABLE "CampaignQuest" ADD CONSTRAINT "CampaignQuest_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL;

-- Clean orphans before FK
DELETE FROM "CharacterClearedDungeon" WHERE "dungeonId" NOT IN (SELECT "id" FROM "Location");
-- CharacterClearedDungeon.dungeonId FK to Location
ALTER TABLE "CharacterClearedDungeon" ADD CONSTRAINT "CharacterClearedDungeon_dungeonId_fkey"
  FOREIGN KEY ("dungeonId") REFERENCES "Location"("id") ON DELETE CASCADE;
CREATE INDEX "CharacterClearedDungeon_dungeonId_idx" ON "CharacterClearedDungeon"("dungeonId");

-- Clean up orphaned LocationEdge rows before adding FK constraints
DELETE FROM "LocationEdge" WHERE "fromLocationId" NOT IN (SELECT "id" FROM "Location");
DELETE FROM "LocationEdge" WHERE "toLocationId" NOT IN (SELECT "id" FROM "Location");
-- LocationEdge new FK constraints
ALTER TABLE "LocationEdge" ADD CONSTRAINT "LocationEdge_fromLocationId_fkey"
  FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE CASCADE;
ALTER TABLE "LocationEdge" ADD CONSTRAINT "LocationEdge_toLocationId_fkey"
  FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE CASCADE;
-- Recreate indexes for new columns
DROP INDEX IF EXISTS "LocationEdge_fromKind_fromId_idx";
DROP INDEX IF EXISTS "LocationEdge_toKind_toId_idx";
CREATE INDEX "LocationEdge_fromLocationId_idx" ON "LocationEdge"("fromLocationId");
CREATE INDEX "LocationEdge_toLocationId_idx" ON "LocationEdge"("toLocationId");

-- Clean orphans before FK
DELETE FROM "CampaignEdge" WHERE "fromLocationId" NOT IN (SELECT "id" FROM "Location");
DELETE FROM "CampaignEdge" WHERE "toLocationId" NOT IN (SELECT "id" FROM "Location");
-- CampaignEdge new FK constraints
ALTER TABLE "CampaignEdge" ADD CONSTRAINT "CampaignEdge_fromLocationId_fkey"
  FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE CASCADE;
ALTER TABLE "CampaignEdge" ADD CONSTRAINT "CampaignEdge_toLocationId_fkey"
  FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE CASCADE;
DROP INDEX IF EXISTS "CampaignEdge_fromKind_fromId_idx";
DROP INDEX IF EXISTS "CampaignEdge_toKind_toId_idx";
CREATE INDEX "CampaignEdge_fromLocationId_idx" ON "CampaignEdge"("fromLocationId");
CREATE INDEX "CampaignEdge_toLocationId_idx" ON "CampaignEdge"("toLocationId");

-- Clean orphans before FK
DELETE FROM "NPCPromotionCandidate" WHERE "npcId" NOT IN (SELECT "id" FROM "Npc");
-- NPCPromotionCandidate.npcId FK
ALTER TABLE "NPCPromotionCandidate" ADD CONSTRAINT "NPCPromotionCandidate_npcId_fkey"
  FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE CASCADE;

-- Clean orphans before FK
DELETE FROM "LocationPromotionCandidate" WHERE "sourceLocationId" NOT IN (SELECT "id" FROM "Location");
-- LocationPromotionCandidate.sourceLocationId FK
ALTER TABLE "LocationPromotionCandidate" ADD CONSTRAINT "LocationPromotionCandidate_sourceLocationId_fkey"
  FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE CASCADE;

-- Road FKs point to unified Location (IDs preserved)
ALTER TABLE "Road" DROP CONSTRAINT IF EXISTS "Road_fromLocationId_fkey";
ALTER TABLE "Road" DROP CONSTRAINT IF EXISTS "Road_toLocationId_fkey";
DELETE FROM "Road" WHERE "fromLocationId" NOT IN (SELECT "id" FROM "Location");
DELETE FROM "Road" WHERE "toLocationId" NOT IN (SELECT "id" FROM "Location");
ALTER TABLE "Road" ADD CONSTRAINT "Road_fromLocationId_fkey"
  FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE CASCADE;
ALTER TABLE "Road" ADD CONSTRAINT "Road_toLocationId_fkey"
  FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE CASCADE;

-- UserDiscoveredLocation FK to Location
ALTER TABLE "UserDiscoveredLocation" DROP CONSTRAINT IF EXISTS "UserDiscoveredLocation_locationId_fkey";
DELETE FROM "UserDiscoveredLocation" WHERE "locationId" NOT IN (SELECT "id" FROM "Location");
ALTER TABLE "UserDiscoveredLocation" ADD CONSTRAINT "UserDiscoveredLocation_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 5: Drop old tables
-- ═══════════════════════════════════════════════════════════════════════

-- Drop child tables first (FK dependencies)
DROP TABLE IF EXISTS "WorldNpcKnowledge" CASCADE;
DROP TABLE IF EXISTS "WorldNpcDialogTurn" CASCADE;
DROP TABLE IF EXISTS "WorldNpcAttribution" CASCADE;
DROP TABLE IF EXISTS "WorldNpcKnownLocation" CASCADE;
DROP TABLE IF EXISTS "WorldLocationKnowledge" CASCADE;
DROP TABLE IF EXISTS "CampaignNpcExperience" CASCADE;
DROP TABLE IF EXISTS "CampaignNpcRelationship" CASCADE;
DROP TABLE IF EXISTS "CampaignNpcLocationMovement" CASCADE;
DROP TABLE IF EXISTS "CampaignDiscoveredLocation" CASCADE;

-- Drop main tables
DROP TABLE IF EXISTS "CampaignNPC" CASCADE;
DROP TABLE IF EXISTS "WorldNPC" CASCADE;
DROP TABLE IF EXISTS "CampaignLocation" CASCADE;
DROP TABLE IF EXISTS "WorldLocation" CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 6: Sequence resets for bigserial columns
-- ═══════════════════════════════════════════════════════════════════════

SELECT setval('"NpcKnowledge_id_seq"', COALESCE((SELECT MAX("id") FROM "NpcKnowledge"), 0) + 1);
SELECT setval('"NpcExperience_id_seq"', COALESCE((SELECT MAX("id") FROM "NpcExperience"), 0) + 1);
SELECT setval('"NpcRelationship_id_seq"', COALESCE((SELECT MAX("id") FROM "NpcRelationship"), 0) + 1);
SELECT setval('"NpcLocationMovement_id_seq"', COALESCE((SELECT MAX("id") FROM "NpcLocationMovement"), 0) + 1);
SELECT setval('"NpcDialogTurn_id_seq"', COALESCE((SELECT MAX("id") FROM "NpcDialogTurn"), 0) + 1);
SELECT setval('"NpcAttribution_id_seq"', COALESCE((SELECT MAX("id") FROM "NpcAttribution"), 0) + 1);
SELECT setval('"LocationKnowledge_id_seq"', COALESCE((SELECT MAX("id") FROM "LocationKnowledge"), 0) + 1);

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 7: Backfill missing columns on existing tables
-- ═══════════════════════════════════════════════════════════════════════

-- CustomSpell.combatStats was added to the Prisma schema but never migrated.
ALTER TABLE "CustomSpell" ADD COLUMN IF NOT EXISTS "combatStats" JSONB;

-- Entity registry lifecycle columns for CustomSpell
ALTER TABLE "CustomSpell" ADD COLUMN IF NOT EXISTS "globallyActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CustomSpell" ADD COLUMN IF NOT EXISTS "softDeletedAt" TIMESTAMPTZ;
ALTER TABLE "CustomSpell" ADD COLUMN IF NOT EXISTS "originCampaignId" UUID;
CREATE INDEX IF NOT EXISTS "CustomSpell_globallyActive_softDeletedAt_idx" ON "CustomSpell"("globallyActive", "softDeletedAt");
