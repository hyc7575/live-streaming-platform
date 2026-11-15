-- 후원 줄(#166): 후원이 PAID가 되면 채팅에 후원자가 쓴 줄 하나를 남긴다.
-- 후원 하나에 줄 하나다(UNIQUE). 방송을 지우면 채팅과 함께 지워지고
-- 후원 행은 남는다(#114).

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "donationId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_donationId_key" ON "ChatMessage"("donationId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill
-- 이미 결제된 후원에도 승인 시각에 후원 줄을 놓는다. 그래야 지난 다시보기의
-- 채팅 기록에도 보인다. 방송이 지워진 후원(#114)은 놓을 채팅이 없다.
INSERT INTO "ChatMessage" ("id", "broadcastId", "authorId", "body", "createdAt", "donationId")
SELECT gen_random_uuid(), d."broadcastId", d."donorId", d."message",
  COALESCE(d."approvedAt", d."createdAt"), d."id"
FROM "Donation" AS d
WHERE d."status" = 'PAID' AND d."broadcastId" IS NOT NULL;
