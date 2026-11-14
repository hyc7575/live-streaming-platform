import type { BroadcastStatus } from '../generated/prisma/client.js';

export interface RecordingFile {
  name: string;
  bytes: number;
  mtimeMs: number;
  // 영상의 0초 지점이 녹화된 시각. info XML과 영상 트랙을 읽을 수 있었던
  // 완성된 .mp4에만 있다. 그 밖에는 null이다.
  startedAt: Date | null;
}

// 녹화 루트 아래 방송 하나의 디렉터리. OME가 스트림 이름을 따서
// 짓고, 스트림 이름은 방송 id이다.
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
  // 상한 아래로 내려가려고 녹화를 지울 ENDED 방송들. 가장 먼저 끝난 것부터.
  // 디렉터리를 지우기 전에 컬럼을 비운다.
  evict: string[];
  // 방송이 더 이상 없는 디렉터리들.
  remove: string[];
  // startedAt은 파일마다 시작 시각 하나를 담는다. 하나라도 모르면 비운다.
  // 파트들에 걸쳐 채팅을 맞추려면 전부 필요하기 때문이다.
  setFiles: { id: string; files: string[]; startedAt: Date[] }[];
  // 지울 수 있는 디렉터리를 모두 빼고도 상한을 넘는 바이트 수.
  overCapBytes: number;
}

// OME는 tmp_<random>에 쓰다가 파일이 완성되면 최종 .mp4로
// 이름을 바꾼다.
const WRITING_PREFIX = 'tmp_';

// 디스크가 기준이고 Broadcast.recordingFiles와
// recordingStartedAt은 그 투영이다. 그래서 계획은 컬럼을
// 디스크 내용 쪽으로만 옮긴다.
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

// 녹화 순서대로.
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
