-- DropForeignKey
ALTER TABLE "CampaignDiscoveredLocation" DROP CONSTRAINT "CampaignDiscoveredLocation_locationId_fkey";

-- DropForeignKey
ALTER TABLE "CampaignEdgeDiscovery" DROP CONSTRAINT "CampaignEdgeDiscovery_edgeId_fkey";

-- DropForeignKey
ALTER TABLE "CampaignNPC" DROP CONSTRAINT "CampaignNPC_lastLocationId_fkey";

-- DropForeignKey
ALTER TABLE "CharacterClearedDungeon" DROP CONSTRAINT "CharacterClearedDungeon_dungeonId_fkey";

-- DropForeignKey
ALTER TABLE "LocationPromotionCandidate" DROP CONSTRAINT "LocationPromotionCandidate_worldLocationId_fkey";

-- DropForeignKey
ALTER TABLE "UserDiscoveredEdge" DROP CONSTRAINT "UserDiscoveredEdge_edgeId_fkey";

-- DropForeignKey
ALTER TABLE "WorldLocationEdge" DROP CONSTRAINT "WorldLocationEdge_fromLocationId_fkey";

-- DropForeignKey
ALTER TABLE "WorldLocationEdge" DROP CONSTRAINT "WorldLocationEdge_toLocationId_fkey";

-- DropIndex
DROP INDEX "CampaignDiscoveredLocation_locationId_idx";

-- DropIndex
DROP INDEX "CharacterClearedDungeon_dungeonId_idx";

-- DropIndex
DROP INDEX "LocationPromotionCandidate_campaignId_worldLocationId_key";

-- DropIndex
DROP INDEX "WorldLocation_isCanonical_createdByCampaignId_idx";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "currentLocationId" UUID,
ADD COLUMN     "currentLocationKind" TEXT;

-- AlterTable
ALTER TABLE "CampaignDiscoveredLocation" DROP CONSTRAINT "CampaignDiscoveredLocation_pkey",
ADD COLUMN     "locationKind" TEXT NOT NULL,
ADD CONSTRAINT "CampaignDiscoveredLocation_pkey" PRIMARY KEY ("campaignId", "locationKind", "locationId");

-- AlterTable
ALTER TABLE "CampaignNPC" ADD COLUMN     "lastLocationKind" TEXT;

-- AlterTable
ALTER TABLE "CharacterClearedDungeon" DROP CONSTRAINT "CharacterClearedDungeon_pkey",
ADD COLUMN     "dungeonKind" TEXT NOT NULL,
ADD CONSTRAINT "CharacterClearedDungeon_pkey" PRIMARY KEY ("characterId", "dungeonKind", "dungeonId");

-- AlterTable
ALTER TABLE "LocationPromotionCandidate" DROP COLUMN "worldLocationId",
ADD COLUMN     "sourceLocationId" UUID NOT NULL,
ADD COLUMN     "sourceLocationKind" TEXT NOT NULL DEFAULT 'campaign';

-- AlterTable
ALTER TABLE "WorldLocation" DROP COLUMN "createdByCampaignId",
DROP COLUMN "isCanonical";

-- DropTable
DROP TABLE "WorldLocationEdge";

-- CreateTable
CREATE TABLE "Road" (
    "id" UUID NOT NULL,
    "fromLocationId" UUID NOT NULL,
    "toLocationId" UUID NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "difficulty" "DangerLevel" NOT NULL DEFAULT 'safe',
    "terrainType" TEXT NOT NULL DEFAULT 'road',
    "direction" TEXT,
    "gated" BOOLEAN NOT NULL DEFAULT false,
    "gateHint" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Road_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignLocation" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'generic',
    "locationType" "LocationType" NOT NULL DEFAULT 'generic',
    "region" TEXT,
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "regionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "subGridX" INTEGER,
    "subGridY" INTEGER,
    "parentLocationKind" TEXT,
    "parentLocationId" UUID,
    "maxKeyNpcs" INTEGER NOT NULL DEFAULT 10,
    "maxSubLocations" INTEGER NOT NULL DEFAULT 5,
    "slotType" TEXT,
    "slotKind" TEXT NOT NULL DEFAULT 'custom',
    "dangerLevel" "DangerLevel" NOT NULL DEFAULT 'safe',
    "roomMetadata" JSONB,
    "embeddingText" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CampaignLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Road_fromLocationId_idx" ON "Road"("fromLocationId");

-- CreateIndex
CREATE INDEX "Road_toLocationId_idx" ON "Road"("toLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "Road_fromLocationId_toLocationId_key" ON "Road"("fromLocationId", "toLocationId");

-- CreateIndex
CREATE INDEX "CampaignLocation_campaignId_idx" ON "CampaignLocation"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignLocation_regionX_regionY_idx" ON "CampaignLocation"("regionX", "regionY");

-- CreateIndex
CREATE INDEX "CampaignLocation_locationType_idx" ON "CampaignLocation"("locationType");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignLocation_campaignId_canonicalSlug_key" ON "CampaignLocation"("campaignId", "canonicalSlug");

-- CreateIndex
CREATE INDEX "CampaignDiscoveredLocation_locationKind_locationId_idx" ON "CampaignDiscoveredLocation"("locationKind", "locationId");

-- CreateIndex
CREATE INDEX "CharacterClearedDungeon_dungeonKind_dungeonId_idx" ON "CharacterClearedDungeon"("dungeonKind", "dungeonId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationPromotionCandidate_campaignId_sourceLocationKind_so_key" ON "LocationPromotionCandidate"("campaignId", "sourceLocationKind", "sourceLocationId");

-- AddForeignKey
ALTER TABLE "Road" ADD CONSTRAINT "Road_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "WorldLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Road" ADD CONSTRAINT "Road_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "WorldLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLocation" ADD CONSTRAINT "CampaignLocation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDiscoveredEdge" ADD CONSTRAINT "UserDiscoveredEdge_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "Road"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEdgeDiscovery" ADD CONSTRAINT "CampaignEdgeDiscovery_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "Road"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- F5b: HNSW index for CampaignLocation embedding (cosine), parity with WorldLocation
CREATE INDEX IF NOT EXISTS "CampaignLocation_embedding_hnsw_idx"
  ON "CampaignLocation"
  USING hnsw ("embedding" vector_cosine_ops);

