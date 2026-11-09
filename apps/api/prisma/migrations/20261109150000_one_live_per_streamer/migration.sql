-- CreateIndex
CREATE UNIQUE INDEX "Broadcast_one_live_per_streamer" ON "Broadcast"("streamerId") WHERE (status = 'LIVE');

