-- Add pendingProvidence one-shot payload to Campaign. Mirror of pendingSlip
-- pattern (introduced in 20260507230000_multi_feature_batch) but JSONB so
-- the next scene generation can read summary[] + narrativeComment back out.
ALTER TABLE "Campaign" ADD COLUMN "pendingProvidence" JSONB;
