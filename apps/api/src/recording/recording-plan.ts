import type { BroadcastStatus } from '../generated/prisma/client.js';

export interface RecordingFile {
  name: string;
  bytes: number;
  mtimeMs: number;
  // When the video at 0 s was recorded, for a finished .mp4 whose info XML
  // and video track could be read. Null otherwise.
  startedAt: Date | null;
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
  recordingStartedAt: Date[];
}

export interface RecordingPlan {
  // ENDED broadcasts whose recordings go to stay under the cap, oldest end
  // first. Their columns are cleared before the directory is deleted.
  evict: string[];
  // Directories whose broadcast no longer exists.
  remove: string[];
  // startedAt holds one start per file, or none when any start is unknown:
  // lining chat up across parts needs all of them.
  setFiles: { id: string; files: string[]; startedAt: Date[] }[];
  // Bytes still over the cap once every evictable directory is counted out.
  overCapBytes: number;
}

// OME writes into tmp_<random> and renames it to the final .mp4 once the
// file is complete.
const WRITING_PREFIX = 'tmp_';

// The disk is the source of truth and Broadcast.recordingFiles and
// recordingStartedAt a projection of it, so the plan only ever moves the
// columns toward what the disk holds.
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
    let finished: RecordingFile[];
    if (!dir) {
      finished = [];
    } else if (row.status !== 'ENDED' || isWriting(dir)) {
      continue;
    } else {
      finished = finishedFiles(dir);
    }
    const files = finished.map((file) => `${row.id}/${file.name}`);
    const startedAt = allStarts(finished);
    if (
      !sameList(files, row.recordingFiles) ||
      !sameList(
        startedAt.map((date) => date.getTime()),
        row.recordingStartedAt.map((date) => date.getTime()),
      )
    ) {
      setFiles.push({ id: row.id, files, startedAt });
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

// In recording order.
function finishedFiles(dir: RecordingDir): RecordingFile[] {
  return dir.files
    .filter((file) => file.name.endsWith('.mp4'))
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));
}

function allStarts(files: RecordingFile[]): Date[] {
  const starts = files.map((file) => file.startedAt);
  return starts.every((start) => start !== null) ? starts : [];
}

function sameList<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
