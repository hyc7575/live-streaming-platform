-- 방송 대분류(PRD-category 7.1). 기본값 덕분에 기존 방송은 모두 ETC로 채워진다.

-- CreateEnum
CREATE TYPE "BroadcastCategory" AS ENUM ('GAME', 'TALK', 'MUSIC', 'STUDY', 'SPORTS', 'ETC');

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "category" "BroadcastCategory" NOT NULL DEFAULT 'ETC';
