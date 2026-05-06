-- CreateTable
CREATE TABLE "TopicHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "seedText" TEXT NOT NULL,
    "generatedTopic" TEXT NOT NULL,
    "genre" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicHistory_userId_createdAt_idx" ON "TopicHistory"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "TopicHistory" ADD CONSTRAINT "TopicHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
