import type { BroadcastStatus } from './components/StatusBadge';

// Mirrors BroadcastView from apps/api/src/broadcasts/broadcasts.service.ts.
export interface Broadcast {
  id: string;
  title: string;
  description: string;
  status: BroadcastStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  // Paths under /recordings, oldest first. Empty means no replay.
  recordingFiles: string[];
  // The streamer's latest captured frame under /thumbnails, or null when the
  // broadcast never uploaded one.
  thumbnailUrl: string | null;
  // The streamer's standby image under /thumbnails, shared by all their
  // broadcasts, or null when they never uploaded one.
  standbyImageUrl: string | null;
  streamer: { id: string; nickname: string };
}

export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 2000;
