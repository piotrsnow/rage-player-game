-- AlterTable
ALTER TABLE "LlmCallLog" ADD COLUMN "request" JSONB;
ALTER TABLE "LlmCallLog" ADD COLUMN "response" JSONB;
