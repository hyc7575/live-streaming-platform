-- Profile editing (PRD-mypage 7.1): an introduction and a profile image,
-- stored like the standby image.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarExt" TEXT,
ADD COLUMN     "avatarUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "bio" TEXT NOT NULL DEFAULT '';
