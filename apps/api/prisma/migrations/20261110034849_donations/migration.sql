-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "Donation" (
    "id" UUID NOT NULL,
    "orderId" TEXT NOT NULL,
    "broadcastId" UUID NOT NULL,
    "donorId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
    "paymentKey" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Donation_orderId_key" ON "Donation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_paymentKey_key" ON "Donation"("paymentKey");

-- CreateIndex
CREATE INDEX "Donation_broadcastId_status_approvedAt_idx" ON "Donation"("broadcastId", "status", "approvedAt");

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
