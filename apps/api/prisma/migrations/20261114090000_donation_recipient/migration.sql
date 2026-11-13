-- Donations name their streamer (PRD-mypage 7.1), so a streamer's received
-- total survives deleting a broadcast (#114 clears broadcastId). Rows whose
-- broadcast is already gone stay NULL: nothing records who received them.

-- AlterTable
ALTER TABLE "Donation" ADD COLUMN "recipientId" UUID;

-- Backfill
UPDATE "Donation" AS d
SET "recipientId" = b."streamerId"
FROM "Broadcast" AS b
WHERE b."id" = d."broadcastId";

-- CreateIndex
CREATE INDEX "Donation_recipientId_status_approvedAt_idx" ON "Donation"("recipientId", "status", "approvedAt");

-- CreateIndex
CREATE INDEX "Donation_donorId_status_approvedAt_idx" ON "Donation"("donorId", "status", "approvedAt");

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
