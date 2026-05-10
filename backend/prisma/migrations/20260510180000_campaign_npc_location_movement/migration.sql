-- Append-only log of CampaignNPC graph-node moves (location graph inspector).

CREATE TABLE "CampaignNpcLocationMovement" (
    "id" BIGSERIAL NOT NULL,
    "campaignNpcId" UUID NOT NULL,
    "fromKind" TEXT,
    "fromId" UUID,
    "toKind" TEXT NOT NULL,
    "toId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "sceneIndex" INTEGER,
    "movedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignNpcLocationMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignNpcLocationMovement_campaignNpcId_movedAt_idx"
ON "CampaignNpcLocationMovement" ("campaignNpcId", "movedAt" DESC);

ALTER TABLE "CampaignNpcLocationMovement"
ADD CONSTRAINT "CampaignNpcLocationMovement_campaignNpcId_fkey"
FOREIGN KEY ("campaignNpcId") REFERENCES "CampaignNPC"("id") ON DELETE CASCADE ON UPDATE CASCADE;
