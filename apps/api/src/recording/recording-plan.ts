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
  startedAt: Date | null;
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
  // 녹화를 멈추고, 멈춘 채로 둘 LIVE 방송들(#209). 디스크와 시각에서
  // 매 주기 새로 나온다. LIVE 녹화의 크기와 경과 시간은 줄지 않으므로
  // 한 번 걸린 방송은 LIVE인 동안 계속 걸린다.
  stopLive: string[];
  // 계획대로 지운 뒤에도 상한을 넘는 바이트 수.
  overCapBytes: number;
}

export interface RecordingLimits {
  // 녹화 폴더 전체의 상한.
  maxBytes: number;
  // LIVE 방송 하나의 녹화 크기와 녹화 시간 상한. 넘으면 그 녹화를 멈춘다.
  perBroadcastMaxBytes: number;
  perBroadcastMaxMs: number;
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
  limits: RecordingLimits,
  now: Date,
): RecordingPlan {
  const capBytes = limits.maxBytes;
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const dirById = new Map(dirs.map((dir) => [dir.broadcastId, dir]));

  const remove = dirs
    .filter((dir) => !rowById.has(dir.broadcastId))
    .map((dir) => dir.broadcastId);

  const kept = dirs.filter((dir) => rowById.has(dir.broadcastId));
  let total = kept.reduce((sum, dir) => sum + bytesOf(dir), 0);
  const isEnded = (dir: RecordingDir) =>
    rowById.get(dir.broadcastId)?.status === 'ENDED';
  const unevictable = kept.filter((dir) => !isEnded(dir));
  const unevictableBytes = unevictable.reduce(
    (sum, dir) => sum + bytesOf(dir),
    0,
  );

  // ENDED를 모두 지워도 상한 아래로 못 내려가면 하나도 지우지 않는다.
  // 그만큼은 LIVE 녹화가 차지한 것이므로, 다른 방송의 다시보기 대신
  // LIVE 녹화를 멈춘다.
  const liveOverCap = unevictableBytes > capBytes;
  const stopLive = unevictable
    .filter((dir) => {
      const row = rowById.get(dir.broadcastId);
      if (row?.status !== 'LIVE') return false;
      return (
        liveOverCap ||
        bytesOf(dir) >= limits.perBroadcastMaxBytes ||
        (row.startedAt !== null &&
          now.getTime() - row.startedAt.getTime() >= limits.perBroadcastMaxMs)
      );
    })
    .map((dir) => dir.broadcastId)
    .sort();

  const evictable = liveOverCap
    ? []
    : kept
        .filter(isEnded)
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
    stopLive,
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
