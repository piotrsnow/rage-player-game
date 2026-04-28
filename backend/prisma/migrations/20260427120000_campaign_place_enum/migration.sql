-- AlterEnum
-- Campaign-creation feature: thematic AI-emitted locations land here when
-- the LLM doesn't pin a more specific type. Replaces the legacy "generic"
-- fallback for AI mid-play emits as a more discoverable category.
ALTER TYPE "LocationType" ADD VALUE 'campaignPlace';
