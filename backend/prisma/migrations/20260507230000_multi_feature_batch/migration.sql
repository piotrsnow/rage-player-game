-- Multi-feature batch: skill gains, campaign incidents, campaign edges,
-- topic history, Stripe/credits on User, character badges, Road expansion,
-- new enum values for DiscoveryState and LocationType.

-- ── Enum extensions ─────────────────────────────────────────────────────

ALTER TYPE "DiscoveryState" ADD VALUE 'rumored';
ALTER TYPE "DiscoveryState" ADD VALUE 'mapped';

ALTER TYPE "LocationType" ADD VALUE 'region';
ALTER TYPE "LocationType" ADD VALUE 'area';
ALTER TYPE "LocationType" ADD VALUE 'district';
ALTER TYPE "LocationType" ADD VALUE 'site';
ALTER TYPE "LocationType" ADD VALUE 'room';
ALTER TYPE "LocationType" ADD VALUE 'point';
ALTER TYPE "LocationType" ADD VALUE 'abstract';

-- ── Existing table alterations ──────────────────────────────────────────

-- Campaign
ALTER TABLE "Campaign" ADD COLUMN "pendingSlip" TEXT;

-- Character badges
ALTER TABLE "Character"
  ADD COLUMN "badgeLegend"    TEXT,
  ADD COLUMN "badgeSnark"     TEXT,
  ADD COLUMN "badgeSummary"   TEXT,
  ADD COLUMN "badgeUpdatedAt" TIMESTAMPTZ;

-- FavoriteScene / LlmCallLog / LocationEdge / ServerSettings — drop auto-generated defaults
ALTER TABLE "FavoriteScene"    ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "LlmCallLog"      ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "LocationEdge"    ALTER COLUMN "id" DROP DEFAULT,
                               ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "ServerSettings"  ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Road expansion (graph consolidation support)
DROP INDEX "Road_fromLocationId_toLocationId_key";

ALTER TABLE "Road"
  ADD COLUMN "bidirectional" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "confidence"    DOUBLE PRECISION,
  ADD COLUMN "description"   TEXT,
  ADD COLUMN "metadata"      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "relationType"  TEXT NOT NULL DEFAULT 'road',
  ADD COLUMN "risk"          TEXT,
  ADD COLUMN "travelTime"    DOUBLE PRECISION,
  ADD COLUMN "visibility"    TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN "weight"        DOUBLE PRECISION;

CREATE INDEX "Road_relationType_idx"
  ON "Road" ("relationType");

CREATE UNIQUE INDEX "Road_fromLocationId_toLocationId_relationType_key"
  ON "Road" ("fromLocationId", "toLocationId", "relationType");

-- User: Stripe + credits
ALTER TABLE "User"
  ADD COLUMN "credits"          INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN "stripeCustomerId" TEXT;

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User" ("stripeCustomerId");

-- ── New tables ──────────────────────────────────────────────────────────

CREATE TABLE "CharacterSkillGain" (
  "id"            UUID NOT NULL,
  "characterId"   UUID NOT NULL,
  "skillName"     TEXT NOT NULL,
  "xpGained"      INTEGER NOT NULL,
  "oldLevel"      INTEGER NOT NULL,
  "newLevel"      INTEGER NOT NULL,
  "playerAction"  TEXT,
  "narrative"     TEXT,
  "diceRollInfo"  JSONB,
  "sceneIndex"    INTEGER,
  "campaignId"    UUID,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CharacterSkillGain_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CharacterSkillGain_characterId_skillName_createdAt_idx"
  ON "CharacterSkillGain" ("characterId", "skillName", "createdAt");

CREATE INDEX "CharacterSkillGain_characterId_idx"
  ON "CharacterSkillGain" ("characterId");

ALTER TABLE "CharacterSkillGain"
  ADD CONSTRAINT "CharacterSkillGain_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──

CREATE TABLE "CampaignIncident" (
  "id"               UUID NOT NULL,
  "campaignId"       UUID NOT NULL,
  "userId"           UUID NOT NULL,
  "sceneIndex"       INTEGER NOT NULL,
  "playerComplaint"  TEXT NOT NULL,
  "aiVerdict"        TEXT NOT NULL,
  "isPlayerRight"    BOOLEAN NOT NULL,
  "technicalDetails" TEXT,
  "corrections"      JSONB,
  "narrativeComment" TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignIncident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignIncident_campaignId_sceneIndex_idx"
  ON "CampaignIncident" ("campaignId", "sceneIndex");

CREATE INDEX "CampaignIncident_userId_idx"
  ON "CampaignIncident" ("userId");

ALTER TABLE "CampaignIncident"
  ADD CONSTRAINT "CampaignIncident_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignIncident"
  ADD CONSTRAINT "CampaignIncident_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──

CREATE TABLE "CampaignEdge" (
  "id"              UUID NOT NULL,
  "campaignId"      UUID NOT NULL,
  "fromKind"        TEXT NOT NULL,
  "fromId"          UUID NOT NULL,
  "toKind"          TEXT NOT NULL,
  "toId"            UUID NOT NULL,
  "relationType"    TEXT NOT NULL DEFAULT 'path',
  "bidirectional"   BOOLEAN NOT NULL DEFAULT true,
  "distance"        DOUBLE PRECISION,
  "difficulty"      "DangerLevel",
  "metadata"        JSONB NOT NULL DEFAULT '{}'::jsonb,
  "visibility"      TEXT NOT NULL DEFAULT 'visible',
  "risk"            TEXT,
  "travelTime"      DOUBLE PRECISION,
  "description"     TEXT,
  "confidence"      DOUBLE PRECISION,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignEdge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignEdge_campaignId_idx"
  ON "CampaignEdge" ("campaignId");

CREATE INDEX "CampaignEdge_fromKind_fromId_idx"
  ON "CampaignEdge" ("fromKind", "fromId");

CREATE INDEX "CampaignEdge_toKind_toId_idx"
  ON "CampaignEdge" ("toKind", "toId");

CREATE INDEX "CampaignEdge_relationType_idx"
  ON "CampaignEdge" ("relationType");

CREATE UNIQUE INDEX "CampaignEdge_campaignId_fromKind_fromId_toKind_toId_relatio_key"
  ON "CampaignEdge" ("campaignId", "fromKind", "fromId", "toKind", "toId", "relationType");

ALTER TABLE "CampaignEdge"
  ADD CONSTRAINT "CampaignEdge_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──

CREATE TABLE "TopicHistory" (
  "id"             UUID NOT NULL,
  "userId"         UUID NOT NULL,
  "seedText"       TEXT NOT NULL,
  "generatedTopic" TEXT NOT NULL,
  "genre"          TEXT NOT NULL DEFAULT '',
  "tone"           TEXT NOT NULL DEFAULT '',
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TopicHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TopicHistory_userId_createdAt_idx"
  ON "TopicHistory" ("userId", "createdAt" DESC);

ALTER TABLE "TopicHistory"
  ADD CONSTRAINT "TopicHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
