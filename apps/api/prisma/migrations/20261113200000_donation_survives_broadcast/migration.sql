-- A donation outlives its broadcast (#114): deleting the broadcast clears
-- broadcastId instead of deleting the donation.

-- DropForeignKey
ALTER TABLE "Donation" DROP CONSTRAINT "Donation_broadcastId_fkey";

-- AlterTable
ALTER TABLE "Donation" ALTER COLUMN "broadcastId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;
