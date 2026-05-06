-- CreateTable
CREATE TABLE "LocationEdge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromKind" TEXT NOT NULL,
    "fromId" UUID NOT NULL,
    "toKind" TEXT NOT NULL,
    "toId" UUID NOT NULL,
    "edgeType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "bidirectional" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "discoveryState" TEXT NOT NULL DEFAULT 'unknown',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "campaignId" UUID,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationEdge_fromKind_fromId_idx" ON "LocationEdge"("fromKind", "fromId");
CREATE INDEX "LocationEdge_toKind_toId_idx" ON "LocationEdge"("toKind", "toId");
CREATE INDEX "LocationEdge_edgeType_idx" ON "LocationEdge"("edgeType");
CREATE INDEX "LocationEdge_category_idx" ON "LocationEdge"("category");
CREATE INDEX "LocationEdge_campaignId_idx" ON "LocationEdge"("campaignId");

-- AddForeignKey
ALTER TABLE "LocationEdge" ADD CONSTRAINT "LocationEdge_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add semantic metadata columns to WorldLocation
ALTER TABLE "WorldLocation" ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WorldLocation" ADD COLUMN "atmosphere" TEXT;
ALTER TABLE "WorldLocation" ADD COLUMN "narrativeRoles" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WorldLocation" ADD COLUMN "scale" INTEGER NOT NULL DEFAULT 5;

-- AlterTable: add semantic metadata columns to CampaignLocation
ALTER TABLE "CampaignLocation" ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CampaignLocation" ADD COLUMN "atmosphere" TEXT;
ALTER TABLE "CampaignLocation" ADD COLUMN "narrativeRoles" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CampaignLocation" ADD COLUMN "scale" INTEGER NOT NULL DEFAULT 5;
