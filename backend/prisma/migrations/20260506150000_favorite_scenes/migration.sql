-- CreateTable
CREATE TABLE "FavoriteScene" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "characterId" UUID NOT NULL,
    "sceneId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteScene_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteScene_characterId_sceneId_key" ON "FavoriteScene"("characterId", "sceneId");

-- CreateIndex
CREATE INDEX "FavoriteScene_characterId_createdAt_idx" ON "FavoriteScene"("characterId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "FavoriteScene" ADD CONSTRAINT "FavoriteScene_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteScene" ADD CONSTRAINT "FavoriteScene_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "CampaignScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteScene" ADD CONSTRAINT "FavoriteScene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
