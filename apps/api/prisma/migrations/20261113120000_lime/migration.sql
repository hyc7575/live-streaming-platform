-- CreateEnum
CREATE TYPE "DonationMethod" AS ENUM ('TOSS', 'LIME');

-- CreateEnum
CREATE TYPE "LimeChargeStatus" AS ENUM ('PENDING', 'APPROVED', 'FAILED');

-- CreateEnum
CREATE TYPE "LimeLedgerKind" AS ENUM ('CHARGE', 'DONATION');

-- AlterTable
ALTER TABLE "Donation" ADD COLUMN     "method" "DonationMethod" NOT NULL DEFAULT 'TOSS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "limeBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LimeCharge" (
    "id" UUID NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "LimeChargeStatus" NOT NULL DEFAULT 'PENDING',
    "paymentKey" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LimeCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LimeLedger" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" "LimeLedgerKind" NOT NULL,
    "refId" UUID NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LimeLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LimeCharge_orderId_key" ON "LimeCharge"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LimeCharge_paymentKey_key" ON "LimeCharge"("paymentKey");

-- CreateIndex
CREATE INDEX "LimeCharge_userId_createdAt_idx" ON "LimeCharge"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LimeLedger_userId_createdAt_idx" ON "LimeLedger"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LimeLedger_kind_refId_key" ON "LimeLedger"("kind", "refId");

-- AddForeignKey
ALTER TABLE "LimeCharge" ADD CONSTRAINT "LimeCharge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LimeLedger" ADD CONSTRAINT "LimeLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A donation that would overdraw the balance must fail, even if a code path
-- forgets the conditional UPDATE.
ALTER TABLE "User" ADD CONSTRAINT "User_limeBalance_nonnegative" CHECK ("limeBalance" >= 0);
