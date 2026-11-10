import type { BroadcastStatus } from '../generated/prisma/client.js';

export interface RecordingFile {
  name: string;
  bytes: number;
  mtimeMs: number;
}

// One broadcast's directory under the recordings root. OME names it after
// the stream, which is the broadcast id.
export interface RecordingDir {
  broadcastId: string;
  files: RecordingFile[];
}

export interface RecordingRow {
  id: string;
  status: BroadcastStatus;
  endedAt: Date | null;
  recordingFiles: string[];
}

export interface RecordingPlan {
  // ENDED broadcasts whose recordings go to stay under the cap, oldest end
  // first. Their column is cleared before the directory is deleted.
  evict: string[];
  // Directories whose broadcast no longer exists.
  remove: string[];
  setFiles: { id: string; files: string[] }[];
  // Bytes still over the cap once every evictable directory is counted out.
  overCapBytes: number;
}

// OME writes into tmp_<random> and renames it to the final .mp4 once the
// file is complete.
const WRITING_PREFIX = 'tmp_';

// The disk is the source of truth and Broadcast.recordingFiles a projection
// of it, so the plan only ever moves the column toward what the disk holds.
export function planRecordings(
  dirs: RecordingDir[],
  rows: RecordingRow[],
  capBytes: number,
): RecordingPlan {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const dirById = new Map(dirs.map((dir) => [dir.broadcastId, dir]));

  const remove = dirs
    .filter((dir) => !rowById.has(dir.broadcastId))
    .map((dir) => dir.broadcastId);

  const kept = dirs.filter((dir) => rowById.has(dir.broadcastId));
  let total = kept.reduce((sum, dir) => sum + bytesOf(dir), 0);
  const evictable = kept
    .filter((dir) => rowById.get(dir.broadcastId)?.status === 'ENDED')
    .sort(
      (a, b) =>
        endedAtMs(rowById.get(a.broadcastId)) -
          endedAtMs(rowById.get(b.broadcastId)) ||
        a.broadcastId.localeCompare(b.broadcastId),
    );
  const evict: string[] = [];
  for (const dir of evictable) {
    if (total <= capBytes) break;
    evict.push(dir.broadcastId);
    total -= bytesOf(dir);
  }

  const setFiles: RecordingPlan['setFiles'] = [];
  for (const row of rows) {
    if (evict.includes(row.id)) continue;
    const dir = dirById.get(row.id);
    let files: string[];
    if (!dir) {
      files = [];
    } else if (row.status !== 'ENDED' || isWriting(dir)) {
      continue;
    } else {
      files = finishedFiles(dir);
    }
    if (!sameList(files, row.recordingFiles)) {
      setFiles.push({ id: row.id, files });
    }
  }

  return {
    evict,
    remove,
    setFiles,
    overCapBytes: Math.max(0, total - capBytes),
  };
}

function bytesOf(dir: RecordingDir): number {
  return dir.files.reduce((sum, file) => sum + file.bytes, 0);
}

function endedAtMs(row: RecordingRow | undefined): number {
  return row?.endedAt?.getTime() ?? 0;
}

function isWriting(dir: RecordingDir): boolean {
  return dir.files.some((file) => file.name.startsWith(WRITING_PREFIX));
}

// Paths relative to the recordings root, in recording order.
function finishedFiles(dir: RecordingDir): string[] {
  return dir.files
    .filter((file) => file.name.endsWith('.mp4'))
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name))
    .map((file) => `${dir.broadcastId}/${file.name}`);
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
