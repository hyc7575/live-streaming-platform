-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('READY', 'LIVE', 'ENDED');

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" UUID NOT NULL,
    "streamerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "BroadcastStatus" NOT NULL DEFAULT 'READY',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Broadcast_status_createdAt_idx" ON "Broadcast"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Broadcast_streamerId_createdAt_idx" ON "Broadcast"("streamerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_streamerId_fkey" FOREIGN KEY ("streamerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
