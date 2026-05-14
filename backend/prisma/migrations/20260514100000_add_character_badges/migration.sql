-- CreateTable
CREATE TABLE "CharacterBadge" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "campaignId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'shield',
    "imageUrl" TEXT,
    "imagePrompt" TEXT,
    "sceneFrom" INTEGER,
    "sceneTo" INTEGER,
    "xpAwarded" INTEGER,
    "earnedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterBadge_characterId_earnedAt_idx" ON "CharacterBadge"("characterId", "earnedAt");

-- AddForeignKey
ALTER TABLE "CharacterBadge" ADD CONSTRAINT "CharacterBadge_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterBadge" ADD CONSTRAINT "CharacterBadge_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
