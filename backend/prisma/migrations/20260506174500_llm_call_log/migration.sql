-- CreateTable
CREATE TABLE "LlmCallLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "provider" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ,

    CONSTRAINT "LlmCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmCallLog_userId_startedAt_idx" ON "LlmCallLog"("userId", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "LlmCallLog" ADD CONSTRAINT "LlmCallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
