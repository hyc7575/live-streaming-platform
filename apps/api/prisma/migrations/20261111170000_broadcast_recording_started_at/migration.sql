-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "recordingStartedAt" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[];

-- Starts are all known or none are, so lining chat up across parts never
-- meets a part without one.
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_recordingStartedAt_per_file"
  CHECK (cardinality("recordingStartedAt") IN (0, cardinality("recordingFiles")));
