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
  streamer: { id: string; nickname: string };
}

export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 2000;
