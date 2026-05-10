-- ServerSettings was not part of the original migration chain on some databases (introduced via db push).
-- Ensure the singleton row table exists and carries billingEnabled for admin billing toggle + scene stream guard.

CREATE TABLE IF NOT EXISTS "ServerSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "voiceConfig" JSONB NOT NULL DEFAULT '{}',
    "modelOverrides" JSONB NOT NULL DEFAULT '{}',
    "sceneModelConfig" JSONB NOT NULL DEFAULT '{}',
    "fontConfig" JSONB NOT NULL DEFAULT '{}',
    "billingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ServerSettings" ADD COLUMN IF NOT EXISTS "billingEnabled" BOOLEAN NOT NULL DEFAULT false;
