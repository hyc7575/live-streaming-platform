-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "recordingFiles" TEXT[] DEFAULT ARRAY[]::TEXT[];
