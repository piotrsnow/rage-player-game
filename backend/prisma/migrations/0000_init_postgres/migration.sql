-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "DangerLevel" AS ENUM ('safe', 'moderate', 'dangerous', 'deadly');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('generic', 'hamlet', 'village', 'town', 'city', 'capital', 'dungeon', 'forest', 'wilderness', 'mountain', 'ruin', 'camp', 'cave', 'interior', 'dungeon_room');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "apiKeys" TEXT NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "contentLanguage" TEXT NOT NULL DEFAULT 'pl',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" BIGSERIAL NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "deviceInfo" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaignId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL DEFAULT 23,
    "gender" TEXT NOT NULL DEFAULT '',
    "species" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "skills" JSONB NOT NULL DEFAULT '{}',
    "wounds" INTEGER NOT NULL DEFAULT 0,
    "maxWounds" INTEGER NOT NULL DEFAULT 0,
    "movement" INTEGER NOT NULL DEFAULT 4,
    "characterLevel" INTEGER NOT NULL DEFAULT 1,
    "characterXp" INTEGER NOT NULL DEFAULT 0,
    "attributePoints" INTEGER NOT NULL DEFAULT 0,
    "mana" JSONB NOT NULL DEFAULT '{"current":0,"max":0}',
    "spells" JSONB NOT NULL DEFAULT '{"known":[],"usageCounts":{},"scrolls":[]}',
    "inventory" JSONB NOT NULL DEFAULT '[]',
    "materialBag" JSONB NOT NULL DEFAULT '[]',
    "money" JSONB NOT NULL DEFAULT '{"gold":0,"silver":0,"copper":0}',
    "equipped" JSONB NOT NULL DEFAULT '{"mainHand":null,"offHand":null,"armour":null}',
    "status" TEXT,
    "lockedCampaignId" TEXT,
    "lockedCampaignName" TEXT,
    "lockedLocation" TEXT,
    "statuses" JSONB NOT NULL DEFAULT '[]',
    "needs" JSONB NOT NULL DEFAULT '{"hunger":100,"thirst":100,"bladder":100,"hygiene":100,"rest":100}',
    "clearedDungeonIds" JSONB NOT NULL DEFAULT '[]',
    "activeDungeonState" JSONB,
    "backstory" TEXT NOT NULL DEFAULT '',
    "customAttackPresets" JSONB NOT NULL DEFAULT '[]',
    "portraitUrl" TEXT NOT NULL DEFAULT '',
    "voiceId" TEXT NOT NULL DEFAULT '',
    "voiceName" TEXT NOT NULL DEFAULT '',
    "campaignCount" INTEGER NOT NULL DEFAULT 0,
    "fame" INTEGER NOT NULL DEFAULT 0,
    "infamy" INTEGER NOT NULL DEFAULT 0,
    "knownTitles" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "genre" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT '',
    "coreState" JSONB NOT NULL DEFAULT '{}',
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "lastSaved" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "livingWorldEnabled" BOOLEAN NOT NULL DEFAULT false,
    "worldTimeRatio" DOUBLE PRECISION NOT NULL DEFAULT 24.0,
    "worldTimeMaxGapDays" INTEGER NOT NULL DEFAULT 7,
    "difficultyTier" TEXT NOT NULL DEFAULT 'low',
    "settlementCaps" JSONB,
    "worldBounds" JSONB,
    "discoveredLocationIds" JSONB NOT NULL DEFAULT '[]',
    "discoveredSubLocationIds" JSONB NOT NULL DEFAULT '[]',
    "heardAboutLocationIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignParticipant" (
    "campaignId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'player',
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignParticipant_pkey" PRIMARY KEY ("campaignId","characterId")
);

-- CreateTable
CREATE TABLE "CampaignScene" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "sceneIndex" INTEGER NOT NULL,
    "narrative" TEXT NOT NULL,
    "chosenAction" TEXT,
    "suggestedActions" JSONB NOT NULL DEFAULT '[]',
    "dialogueSegments" JSONB NOT NULL DEFAULT '[]',
    "imagePrompt" TEXT,
    "imageUrl" TEXT,
    "soundEffect" TEXT,
    "diceRoll" JSONB,
    "stateChanges" JSONB,
    "scenePacing" TEXT,
    "embeddingText" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignKnowledge" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "entryType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "importance" TEXT,
    "status" TEXT,
    "sceneIndex" INTEGER,
    "embeddingText" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CampaignKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignNPC" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "npcId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'unknown',
    "role" TEXT,
    "personality" TEXT,
    "attitude" TEXT NOT NULL DEFAULT 'neutral',
    "disposition" INTEGER NOT NULL DEFAULT 0,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "lastLocation" TEXT,
    "lastLocationId" UUID,
    "factionId" TEXT,
    "notes" TEXT,
    "relationships" JSONB NOT NULL DEFAULT '[]',
    "worldNpcId" UUID,
    "isAgent" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL DEFAULT 'commoner',
    "pendingIntroHint" TEXT,
    "activeGoal" TEXT,
    "goalProgress" JSONB,
    "experienceLog" JSONB NOT NULL DEFAULT '[]',
    "hasAcknowledgedFame" BOOLEAN NOT NULL DEFAULT false,
    "interactionCount" INTEGER NOT NULL DEFAULT 0,
    "dialogCharCount" INTEGER NOT NULL DEFAULT 0,
    "questInvolvementCount" INTEGER NOT NULL DEFAULT 0,
    "lastInteractionAt" TIMESTAMPTZ,
    "lastInteractionSceneIndex" INTEGER,
    "embeddingText" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CampaignNPC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignCodex" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "codexKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "fragments" JSONB NOT NULL,
    "relatedEntries" JSONB NOT NULL DEFAULT '[]',
    "embeddingText" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CampaignCodex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignQuest" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "questId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'side',
    "description" TEXT NOT NULL DEFAULT '',
    "completionCondition" TEXT,
    "questGiverId" TEXT,
    "turnInNpcId" TEXT,
    "locationId" TEXT,
    "prerequisiteQuestIds" JSONB NOT NULL DEFAULT '[]',
    "objectives" JSONB NOT NULL DEFAULT '[]',
    "reward" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "completedAt" TIMESTAMPTZ,
    "forcedGiver" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CampaignQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignLocationSummary" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "locationName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyNpcs" JSONB NOT NULL DEFAULT '[]',
    "unresolvedHooks" JSONB NOT NULL DEFAULT '[]',
    "sceneCount" INTEGER NOT NULL DEFAULT 0,
    "lastVisitScene" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CampaignLocationSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDmAgent" (
    "campaignId" UUID NOT NULL,
    "dmMemory" JSONB NOT NULL DEFAULT '[]',
    "pendingHooks" JSONB NOT NULL DEFAULT '[]',
    "lastUpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignDmAgent_pkey" PRIMARY KEY ("campaignId")
);

-- CreateTable
CREATE TABLE "WorldLocation" (
    "id" UUID NOT NULL,
    "canonicalName" TEXT NOT NULL,
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
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "knownByDefault" BOOLEAN NOT NULL DEFAULT false,
    "dangerLevel" "DangerLevel" NOT NULL DEFAULT 'safe',
    "createdByCampaignId" UUID,
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "roomMetadata" JSONB,
    "knowledgeBase" JSONB NOT NULL DEFAULT '[]',
    "embeddingText" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "WorldLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldLocationEdge" (
    "id" UUID NOT NULL,
    "fromLocationId" UUID NOT NULL,
    "toLocationId" UUID NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "difficulty" "DangerLevel" NOT NULL DEFAULT 'safe',
    "terrainType" TEXT NOT NULL DEFAULT 'road',
    "direction" TEXT,
    "gated" BOOLEAN NOT NULL DEFAULT false,
    "gateHint" TEXT,
    "discoveredByCampaigns" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldLocationEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWorldKnowledge" (
    "userId" UUID NOT NULL,
    "discoveredLocationIds" JSONB NOT NULL DEFAULT '[]',
    "discoveredEdgeIds" JSONB NOT NULL DEFAULT '[]',
    "heardAboutLocationIds" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UserWorldKnowledge_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WorldNPC" (
    "id" UUID NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "personality" TEXT,
    "alignment" TEXT NOT NULL DEFAULT 'neutral',
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "currentLocationId" UUID,
    "homeLocationId" UUID,
    "pausedAt" TIMESTAMPTZ,
    "pauseSnapshot" JSONB,
    "companionOfCampaignId" UUID,
    "companionJoinedAt" TIMESTAMPTZ,
    "companionLoyalty" INTEGER NOT NULL DEFAULT 50,
    "lockedByCampaignId" UUID,
    "lockedAt" TIMESTAMPTZ,
    "lockedSnapshot" JSONB,
    "dialogHistory" JSONB NOT NULL DEFAULT '{}',
    "knowledgeBase" JSONB NOT NULL DEFAULT '[]',
    "knownLocationIds" JSONB NOT NULL DEFAULT '[]',
    "activeGoal" TEXT,
    "goalProgress" JSONB,
    "schedule" JSONB,
    "lastTickAt" TIMESTAMPTZ,
    "tickIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "lastTickSceneIndex" INTEGER,
    "tickIntervalScenes" INTEGER NOT NULL DEFAULT 2,
    "goalDeadlineAt" TIMESTAMPTZ,
    "lastLocationPingAt" TIMESTAMPTZ,
    "category" TEXT NOT NULL DEFAULT 'commoner',
    "keyNpc" BOOLEAN NOT NULL DEFAULT true,
    "embeddingText" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "WorldNPC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldEvent" (
    "id" BIGSERIAL NOT NULL,
    "worldNpcId" UUID,
    "worldLocationId" UUID,
    "campaignId" UUID,
    "userId" UUID,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "visibility" TEXT NOT NULL DEFAULT 'campaign',
    "gameTime" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldReputation" (
    "id" BIGSERIAL NOT NULL,
    "characterId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "reputationLabel" TEXT,
    "bountyAmount" INTEGER NOT NULL DEFAULT 0,
    "bountyIssuer" TEXT,
    "vendettaActive" BOOLEAN NOT NULL DEFAULT false,
    "lastIncidentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "WorldReputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldNpcAttribution" (
    "id" BIGSERIAL NOT NULL,
    "worldNpcId" UUID NOT NULL,
    "actorCharacterId" UUID NOT NULL,
    "actorCampaignId" UUID NOT NULL,
    "actionType" TEXT NOT NULL,
    "justified" BOOLEAN NOT NULL DEFAULT false,
    "judgeConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "judgeReason" TEXT,
    "alignmentImpact" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'campaign',
    "gameTime" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldNpcAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldLoreSection" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "WorldLoreSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldEntityEmbedding" (
    "id" BIGSERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "WorldEntityEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingWorldStateChange" (
    "id" BIGSERIAL NOT NULL,
    "campaignId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetHint" TEXT NOT NULL,
    "targetEntityId" TEXT,
    "targetEntityType" TEXT,
    "newValue" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "similarity" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMPTZ,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PendingWorldStateChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NPCPromotionCandidate" (
    "id" BIGSERIAL NOT NULL,
    "campaignId" UUID NOT NULL,
    "campaignNpcId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "personality" TEXT,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "dialogSample" TEXT,
    "smallModelVerdict" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMPTZ,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "NPCPromotionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPromotionCandidate" (
    "id" BIGSERIAL NOT NULL,
    "campaignId" UUID NOT NULL,
    "worldLocationId" UUID NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "displayName" TEXT,
    "locationType" TEXT,
    "region" TEXT,
    "description" TEXT,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "smallModelVerdict" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMPTZ,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "LocationPromotionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultiplayerSession" (
    "id" UUID NOT NULL,
    "roomCode" TEXT NOT NULL,
    "hostId" UUID NOT NULL,
    "phase" TEXT NOT NULL,
    "gameState" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MultiplayerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultiplayerSessionPlayer" (
    "sessionId" UUID NOT NULL,
    "odId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "characterId" UUID,
    "userId" UUID,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MultiplayerSessionPlayer_pkey" PRIMARY KEY ("sessionId","odId")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "campaignId" UUID,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "backend" TEXT NOT NULL DEFAULT 'local',
    "path" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrefabAsset" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "backend" TEXT NOT NULL DEFAULT 'local',
    "path" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "lastAccessedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrefabAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "3dwanted" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "campaignId" UUID,
    "objectKey" TEXT NOT NULL,
    "entityKind" TEXT NOT NULL DEFAULT 'object',
    "objectId" TEXT NOT NULL,
    "objectName" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectDescription" TEXT NOT NULL DEFAULT '',
    "sceneId" TEXT NOT NULL DEFAULT '',
    "sceneText" TEXT NOT NULL DEFAULT '',
    "suggestedModelId" TEXT NOT NULL DEFAULT '',
    "suggestedCategory" TEXT NOT NULL DEFAULT '',
    "suggestedFile" TEXT NOT NULL DEFAULT '',
    "matchScore" INTEGER NOT NULL DEFAULT 0,
    "alreadyExists" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'review',
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "3dwanted_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenId_key" ON "RefreshToken"("tokenId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Achievement_userId_idx" ON "Achievement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_userId_achievementId_key" ON "Achievement"("userId", "achievementId");

-- CreateIndex
CREATE INDEX "Character_userId_idx" ON "Character"("userId");

-- CreateIndex
CREATE INDEX "Character_lockedCampaignId_idx" ON "Character"("lockedCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_shareToken_key" ON "Campaign"("shareToken");

-- CreateIndex
CREATE INDEX "Campaign_userId_idx" ON "Campaign"("userId");

-- CreateIndex
CREATE INDEX "Campaign_isPublic_idx" ON "Campaign"("isPublic");

-- CreateIndex
CREATE INDEX "CampaignParticipant_characterId_idx" ON "CampaignParticipant"("characterId");

-- CreateIndex
CREATE INDEX "CampaignScene_campaignId_sceneIndex_idx" ON "CampaignScene"("campaignId", "sceneIndex");

-- CreateIndex
CREATE INDEX "CampaignKnowledge_campaignId_entryType_idx" ON "CampaignKnowledge"("campaignId", "entryType");

-- CreateIndex
CREATE INDEX "CampaignNPC_campaignId_idx" ON "CampaignNPC"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignNPC_worldNpcId_idx" ON "CampaignNPC"("worldNpcId");

-- CreateIndex
CREATE INDEX "CampaignNPC_campaignId_worldNpcId_idx" ON "CampaignNPC"("campaignId", "worldNpcId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignNPC_campaignId_npcId_key" ON "CampaignNPC"("campaignId", "npcId");

-- CreateIndex
CREATE INDEX "CampaignCodex_campaignId_idx" ON "CampaignCodex"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCodex_campaignId_codexKey_key" ON "CampaignCodex"("campaignId", "codexKey");

-- CreateIndex
CREATE INDEX "CampaignQuest_campaignId_idx" ON "CampaignQuest"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignQuest_campaignId_status_idx" ON "CampaignQuest"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignQuest_campaignId_questId_key" ON "CampaignQuest"("campaignId", "questId");

-- CreateIndex
CREATE INDEX "CampaignLocationSummary_campaignId_idx" ON "CampaignLocationSummary"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignLocationSummary_campaignId_locationName_key" ON "CampaignLocationSummary"("campaignId", "locationName");

-- CreateIndex
CREATE UNIQUE INDEX "WorldLocation_canonicalName_key" ON "WorldLocation"("canonicalName");

-- CreateIndex
CREATE INDEX "WorldLocation_region_idx" ON "WorldLocation"("region");

-- CreateIndex
CREATE INDEX "WorldLocation_parentLocationId_idx" ON "WorldLocation"("parentLocationId");

-- CreateIndex
CREATE INDEX "WorldLocation_locationType_idx" ON "WorldLocation"("locationType");

-- CreateIndex
CREATE INDEX "WorldLocation_isCanonical_createdByCampaignId_idx" ON "WorldLocation"("isCanonical", "createdByCampaignId");

-- CreateIndex
CREATE INDEX "WorldLocation_regionX_regionY_idx" ON "WorldLocation"("regionX", "regionY");

-- CreateIndex
CREATE INDEX "WorldLocationEdge_fromLocationId_idx" ON "WorldLocationEdge"("fromLocationId");

-- CreateIndex
CREATE INDEX "WorldLocationEdge_toLocationId_idx" ON "WorldLocationEdge"("toLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorldLocationEdge_fromLocationId_toLocationId_key" ON "WorldLocationEdge"("fromLocationId", "toLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorldNPC_canonicalId_key" ON "WorldNPC"("canonicalId");

-- CreateIndex
CREATE INDEX "WorldNPC_currentLocationId_idx" ON "WorldNPC"("currentLocationId");

-- CreateIndex
CREATE INDEX "WorldNPC_alive_idx" ON "WorldNPC"("alive");

-- CreateIndex
CREATE INDEX "WorldNPC_companionOfCampaignId_idx" ON "WorldNPC"("companionOfCampaignId");

-- CreateIndex
CREATE INDEX "WorldNPC_lockedByCampaignId_idx" ON "WorldNPC"("lockedByCampaignId");

-- CreateIndex
CREATE INDEX "WorldEvent_worldNpcId_createdAt_idx" ON "WorldEvent"("worldNpcId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldEvent_worldLocationId_createdAt_idx" ON "WorldEvent"("worldLocationId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldEvent_campaignId_createdAt_idx" ON "WorldEvent"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldEvent_eventType_idx" ON "WorldEvent"("eventType");

-- CreateIndex
CREATE INDEX "WorldEvent_eventType_visibility_createdAt_idx" ON "WorldEvent"("eventType", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "WorldReputation_characterId_idx" ON "WorldReputation"("characterId");

-- CreateIndex
CREATE INDEX "WorldReputation_scope_scopeKey_score_idx" ON "WorldReputation"("scope", "scopeKey", "score");

-- CreateIndex
CREATE UNIQUE INDEX "WorldReputation_characterId_scope_scopeKey_key" ON "WorldReputation"("characterId", "scope", "scopeKey");

-- CreateIndex
CREATE INDEX "WorldNpcAttribution_actorCharacterId_createdAt_idx" ON "WorldNpcAttribution"("actorCharacterId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldNpcAttribution_worldNpcId_idx" ON "WorldNpcAttribution"("worldNpcId");

-- CreateIndex
CREATE UNIQUE INDEX "WorldLoreSection_slug_key" ON "WorldLoreSection"("slug");

-- CreateIndex
CREATE INDEX "WorldLoreSection_order_idx" ON "WorldLoreSection"("order");

-- CreateIndex
CREATE INDEX "WorldEntityEmbedding_entityType_idx" ON "WorldEntityEmbedding"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "WorldEntityEmbedding_entityType_entityId_key" ON "WorldEntityEmbedding"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "PendingWorldStateChange_status_createdAt_idx" ON "PendingWorldStateChange"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PendingWorldStateChange_campaignId_status_idx" ON "PendingWorldStateChange"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PendingWorldStateChange_campaignId_idempotencyKey_key" ON "PendingWorldStateChange"("campaignId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "NPCPromotionCandidate_status_createdAt_idx" ON "NPCPromotionCandidate"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NPCPromotionCandidate_campaignId_campaignNpcId_key" ON "NPCPromotionCandidate"("campaignId", "campaignNpcId");

-- CreateIndex
CREATE INDEX "LocationPromotionCandidate_status_createdAt_idx" ON "LocationPromotionCandidate"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocationPromotionCandidate_campaignId_worldLocationId_key" ON "LocationPromotionCandidate"("campaignId", "worldLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "MultiplayerSession_roomCode_key" ON "MultiplayerSession"("roomCode");

-- CreateIndex
CREATE INDEX "MultiplayerSessionPlayer_characterId_idx" ON "MultiplayerSessionPlayer"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_key_key" ON "MediaAsset"("key");

-- CreateIndex
CREATE INDEX "MediaAsset_userId_idx" ON "MediaAsset"("userId");

-- CreateIndex
CREATE INDEX "MediaAsset_type_idx" ON "MediaAsset"("type");

-- CreateIndex
CREATE INDEX "MediaAsset_campaignId_idx" ON "MediaAsset"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "PrefabAsset_key_key" ON "PrefabAsset"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PrefabAsset_path_key" ON "PrefabAsset"("path");

-- CreateIndex
CREATE INDEX "PrefabAsset_category_idx" ON "PrefabAsset"("category");

-- CreateIndex
CREATE INDEX "PrefabAsset_fileName_idx" ON "PrefabAsset"("fileName");

-- CreateIndex
CREATE UNIQUE INDEX "3dwanted_objectKey_key" ON "3dwanted"("objectKey");

-- CreateIndex
CREATE INDEX "3dwanted_userId_idx" ON "3dwanted"("userId");

-- CreateIndex
CREATE INDEX "3dwanted_campaignId_idx" ON "3dwanted"("campaignId");

-- CreateIndex
CREATE INDEX "3dwanted_status_idx" ON "3dwanted"("status");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignParticipant" ADD CONSTRAINT "CampaignParticipant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignParticipant" ADD CONSTRAINT "CampaignParticipant_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignScene" ADD CONSTRAINT "CampaignScene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignKnowledge" ADD CONSTRAINT "CampaignKnowledge_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignNPC" ADD CONSTRAINT "CampaignNPC_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignNPC" ADD CONSTRAINT "CampaignNPC_worldNpcId_fkey" FOREIGN KEY ("worldNpcId") REFERENCES "WorldNPC"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignNPC" ADD CONSTRAINT "CampaignNPC_lastLocationId_fkey" FOREIGN KEY ("lastLocationId") REFERENCES "WorldLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCodex" ADD CONSTRAINT "CampaignCodex_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignQuest" ADD CONSTRAINT "CampaignQuest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLocationSummary" ADD CONSTRAINT "CampaignLocationSummary_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDmAgent" ADD CONSTRAINT "CampaignDmAgent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldLocation" ADD CONSTRAINT "WorldLocation_parentLocationId_fkey" FOREIGN KEY ("parentLocationId") REFERENCES "WorldLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldLocationEdge" ADD CONSTRAINT "WorldLocationEdge_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "WorldLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldLocationEdge" ADD CONSTRAINT "WorldLocationEdge_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "WorldLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWorldKnowledge" ADD CONSTRAINT "UserWorldKnowledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldNPC" ADD CONSTRAINT "WorldNPC_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "WorldLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldNPC" ADD CONSTRAINT "WorldNPC_homeLocationId_fkey" FOREIGN KEY ("homeLocationId") REFERENCES "WorldLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldReputation" ADD CONSTRAINT "WorldReputation_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldNpcAttribution" ADD CONSTRAINT "WorldNpcAttribution_worldNpcId_fkey" FOREIGN KEY ("worldNpcId") REFERENCES "WorldNPC"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldNpcAttribution" ADD CONSTRAINT "WorldNpcAttribution_actorCharacterId_fkey" FOREIGN KEY ("actorCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldNpcAttribution" ADD CONSTRAINT "WorldNpcAttribution_actorCampaignId_fkey" FOREIGN KEY ("actorCampaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingWorldStateChange" ADD CONSTRAINT "PendingWorldStateChange_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NPCPromotionCandidate" ADD CONSTRAINT "NPCPromotionCandidate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPromotionCandidate" ADD CONSTRAINT "LocationPromotionCandidate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPromotionCandidate" ADD CONSTRAINT "LocationPromotionCandidate_worldLocationId_fkey" FOREIGN KEY ("worldLocationId") REFERENCES "WorldLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiplayerSession" ADD CONSTRAINT "MultiplayerSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiplayerSessionPlayer" ADD CONSTRAINT "MultiplayerSessionPlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MultiplayerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiplayerSessionPlayer" ADD CONSTRAINT "MultiplayerSessionPlayer_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "3dwanted" ADD CONSTRAINT "3dwanted_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════
-- HNSW vector indexes (cosine distance) for pgvector retrieval.
-- Partial WHERE embedding IS NOT NULL on nullable columns so we don't
-- index rows that haven't been embedded yet.
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX "idx_scene_embedding"     ON "CampaignScene"        USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;
CREATE INDEX "idx_knowledge_embedding" ON "CampaignKnowledge"    USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;
CREATE INDEX "idx_npc_embedding"       ON "CampaignNPC"          USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;
CREATE INDEX "idx_codex_embedding"     ON "CampaignCodex"        USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;
CREATE INDEX "idx_worldloc_embedding"  ON "WorldLocation"        USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;
CREATE INDEX "idx_worldnpc_embedding"  ON "WorldNPC"             USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;
CREATE INDEX "idx_worldent_embedding"  ON "WorldEntityEmbedding" USING hnsw ("embedding" vector_cosine_ops);
