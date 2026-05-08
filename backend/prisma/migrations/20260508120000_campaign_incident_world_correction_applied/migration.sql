-- Track whether incident-driven processStateChanges completed (world/campaign side-effects).
ALTER TABLE "CampaignIncident" ADD COLUMN "worldCorrectionApplied" BOOLEAN;
