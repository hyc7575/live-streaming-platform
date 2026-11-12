import type { BroadcastStatus } from './components/StatusBadge';

// Mirrors BroadcastView from apps/api/src/broadcasts/broadcasts.service.ts.
export interface Broadcast {
  id: string;
  title: string;
  description: string;
  status: BroadcastStatus;
  startedAt: string | null;
  endedAt: string | null;
  // When the publish dropped while LIVE: set during the reconnect grace,
  // null while a publish is connected or before one ever connected.
  disconnectedAt: string | null;
  createdAt: string;
  // Paths under /recordings, oldest first. Empty means no replay.
  recordingFiles: string[];
  // The same files in the same order, each with the server time its video
  // shows at 0 s, or null when that was never recorded.
  recordingParts: RecordingPart[];
  // The streamer's latest captured frame under /thumbnails, or null when the
  // broadcast never uploaded one.
  thumbnailUrl: string | null;
  // The streamer's standby image under /thumbnails, shared by all their
  // broadcasts, or null when they never uploaded one.
  standbyImageUrl: string | null;
  streamer: { id: string; nickname: string };
}

export interface RecordingPart {
  file: string;
  startedAt: string | null;
}

export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 2000;
