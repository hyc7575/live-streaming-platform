-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "broadcastId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_broadcastId_createdAt_idx" ON "ChatMessage"("broadcastId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Comments written before the broadcast ended, or on one that has not ended,
-- were chat. They move with their ids; the rest stay comments.
INSERT INTO "ChatMessage" ("id", "broadcastId", "authorId", "body", "createdAt")
SELECT c."id", c."broadcastId", c."authorId", c."body", c."createdAt"
FROM "Comment" c
JOIN "Broadcast" b ON b."id" = c."broadcastId"
WHERE b."status" <> 'ENDED' OR c."createdAt" < b."endedAt";

DELETE FROM "Comment" WHERE "id" IN (SELECT "id" FROM "ChatMessage");
