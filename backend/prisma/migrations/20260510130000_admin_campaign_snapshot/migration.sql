-- Admin panel — point-in-time snapshot of full campaign graph. Created
-- automatically before each admin edit (via withSnapshot helper) and
-- manually by the admin user. Restore: deleteMany children → recreate
-- from payload → reconstructFromNormalized.
CREATE TABLE "CampaignSnapshot" (
  "id"         UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "createdBy"  UUID NOT NULL,
  "reason"     TEXT,
  "pinned"     BOOLEAN NOT NULL DEFAULT false,
  "payload"    JSONB NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CampaignSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignSnapshot_campaignId_createdAt_idx"
  ON "CampaignSnapshot"("campaignId", "createdAt");

ALTER TABLE "CampaignSnapshot"
  ADD CONSTRAINT "CampaignSnapshot_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
