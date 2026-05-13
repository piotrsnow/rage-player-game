-- Backfill CampaignNPC rows that have NULL lastLocationKind/lastLocationId
-- with their campaign's currentLocationKind/currentLocationId.
UPDATE "CampaignNPC" AS n
SET
  "lastLocationKind" = c."currentLocationKind",
  "lastLocationId" = c."currentLocationId"
FROM "Campaign" AS c
WHERE n."campaignId" = c."id"
  AND n."lastLocationKind" IS NULL
  AND n."lastLocationId" IS NULL
  AND c."currentLocationKind" IS NOT NULL
  AND c."currentLocationId" IS NOT NULL;
