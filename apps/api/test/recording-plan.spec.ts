import { describe, expect, it } from 'vitest';
import {
  planRecordings,
  type RecordingDir,
  type RecordingFile,
  type RecordingPlan,
  type RecordingRow,
} from '../src/recording/recording-plan.js';

const GB = 1024 ** 3;
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-17T12:00:00Z');

// 방송당 상한은 기본적으로 걸리지 않게 둔다. 그 상한을 보는 테스트만 바꾼다.
function plan(
  dirs: RecordingDir[],
  rows: RecordingRow[],
  maxBytes: number,
  perBroadcast: { bytes?: number; ms?: number } = {},
): RecordingPlan {
  return planRecordings(
    dirs,
    rows,
    {
      maxBytes,
      perBroadcastMaxBytes: perBroadcast.bytes ?? Number.MAX_SAFE_INTEGER,
      perBroadcastMaxMs: perBroadcast.ms ?? Number.MAX_SAFE_INTEGER,
    },
    NOW,
  );
}

function file(
  name: string,
  mtimeMs = 0,
  bytes = 1,
  startedAt: Date | null = null,
): RecordingFile {
  return { name, bytes, mtimeMs, startedAt };
}

function dir(broadcastId: string, ...files: RecordingFile[]): RecordingDir {
  return { broadcastId, files };
}

function row(
  id: string,
  status: RecordingRow['status'],
  recordingFiles: string[] = [],
  endedAt: Date | null = status === 'ENDED'
    ? new Date('2026-11-10T00:00:00Z')
    : null,
  recordingStartedAt: Date[] = [],
  startedAt: Date | null = status === 'READY' ? null : NOW,
): RecordingRow {
  return { id, status, startedAt, endedAt, recordingFiles, recordingStartedAt };
}

const at = (iso: string) => new Date(iso);

const nothing: RecordingPlan = {
  evict: [],
  remove: [],
  setFiles: [],
  stopLive: [],
  overCapBytes: 0,
};

describe('planRecordings', () => {
  it.each<[string, RecordingDir[], RecordingRow[], Partial<RecordingPlan>]>([
    ['an empty disk and no rows', [], [], {}],
    [
      'lists the finished files of an ENDED broadcast oldest first',
      [dir('a', file('1_1.mp4', 20), file('1.xml', 5), file('1_0.mp4', 10))],
      [row('a', 'ENDED')],
      {
        setFiles: [
          { id: 'a', files: ['a/1_0.mp4', 'a/1_1.mp4'], startedAt: [] },
        ],
      },
    ],
    [
      'breaks an mtime tie by name',
      [dir('a', file('1_1.mp4', 10), file('1_0.mp4', 10))],
      [row('a', 'ENDED')],
      {
        setFiles: [
          { id: 'a', files: ['a/1_0.mp4', 'a/1_1.mp4'], startedAt: [] },
        ],
      },
    ],
    [
      'leaves a row that already matches the disk',
      [dir('a', file('1_0.mp4'))],
      [row('a', 'ENDED', ['a/1_0.mp4'])],
      {},
    ],
    [
      'waits while OME still writes a tmp_ file',
      [dir('a', file('1_0.mp4', 10), file('tmp_8f3a', 20))],
      [row('a', 'ENDED')],
      {},
    ],
    [
      'leaves LIVE and READY directories untouched',
      [dir('a', file('1_0.mp4')), dir('b', file('1_0.mp4'))],
      [row('a', 'LIVE'), row('b', 'READY')],
      {},
    ],
    [
      'clears a row whose directory is gone',
      [],
      [row('a', 'ENDED', ['a/1_0.mp4'])],
      { setFiles: [{ id: 'a', files: [], startedAt: [] }] },
    ],
    [
      'clears an ENDED row whose directory holds no finished file',
      [dir('a', file('1.xml'))],
      [row('a', 'ENDED', ['a/1_0.mp4'])],
      { setFiles: [{ id: 'a', files: [], startedAt: [] }] },
    ],
    [
      'removes the directory of a deleted broadcast',
      [dir('gone', file('1_0.mp4'))],
      [],
      { remove: ['gone'] },
    ],
  ])('%s', (_case, dirs, rows, expected) => {
    expect(plan(dirs, rows, GB)).toEqual({ ...nothing, ...expected });
  });

  describe('starts', () => {
    const t0 = '2026-11-10T00:00:00.123Z';
    const t1 = '2026-11-10T00:01:00.456Z';

    it('writes every part’s start in file order when all are known', () => {
      const result = plan(
        [
          dir(
            'a',
            file('1_1.mp4', 20, 1, at(t1)),
            file('1_0.mp4', 10, 1, at(t0)),
          ),
        ],
        [row('a', 'ENDED')],
        GB,
      );
      expect(result.setFiles).toEqual([
        {
          id: 'a',
          files: ['a/1_0.mp4', 'a/1_1.mp4'],
          startedAt: [at(t0), at(t1)],
        },
      ]);
    });

    it('writes no start when any part’s start is unknown', () => {
      const result = plan(
        [dir('a', file('1_0.mp4', 10, 1, at(t0)), file('1_1.mp4', 20))],
        [row('a', 'ENDED')],
        GB,
      );
      expect(result.setFiles).toEqual([
        { id: 'a', files: ['a/1_0.mp4', 'a/1_1.mp4'], startedAt: [] },
      ]);
    });

    it('backfills starts on a row whose files already match', () => {
      const result = plan(
        [dir('a', file('1_0.mp4', 10, 1, at(t0)))],
        [row('a', 'ENDED', ['a/1_0.mp4'])],
        GB,
      );
      expect(result.setFiles).toEqual([
        { id: 'a', files: ['a/1_0.mp4'], startedAt: [at(t0)] },
      ]);
    });

    it('leaves a row whose files and starts both match', () => {
      const result = plan(
        [dir('a', file('1_0.mp4', 10, 1, at(t0)))],
        [row('a', 'ENDED', ['a/1_0.mp4'], undefined, [at(t0)])],
        GB,
      );
      expect(result).toEqual(nothing);
    });

    it('clears the starts with the files when the directory is gone', () => {
      const result = plan(
        [],
        [row('a', 'ENDED', ['a/1_0.mp4'], undefined, [at(t0)])],
        GB,
      );
      expect(result.setFiles).toEqual([{ id: 'a', files: [], startedAt: [] }]);
    });

    it('evicts a row with starts without setting it', () => {
      const result = plan(
        [dir('a', file('1_0.mp4', 10, 100, at(t0)))],
        [row('a', 'ENDED', ['a/1_0.mp4'], undefined, [at(t0)])],
        50,
      );
      expect(result).toEqual({ ...nothing, evict: ['a'] });
    });
  });

  describe('cap', () => {
    const endedAt = (day: number) => new Date(`2026-11-0${day}T00:00:00Z`);

    it('evicts ENDED recordings, oldest end first, until under the cap', () => {
      const result = plan(
        [
          dir('new', file('1_0.mp4', 0, 40)),
          dir('old', file('1_0.mp4', 0, 40)),
          dir('mid', file('1_0.mp4', 0, 40)),
        ],
        [
          row('new', 'ENDED', ['new/1_0.mp4'], endedAt(3)),
          row('old', 'ENDED', ['old/1_0.mp4'], endedAt(1)),
          row('mid', 'ENDED', ['mid/1_0.mp4'], endedAt(2)),
        ],
        80,
      );
      expect(result).toEqual({ ...nothing, evict: ['old'] });
    });

    // #209 회귀: LIVE 녹화만으로 상한을 넘으면 ENDED를 지워도 상한 아래로
    // 못 내려간다. 다른 사람의 다시보기를 지우지 않고 LIVE 녹화를 멈춘다.
    it('stops LIVE recordings that alone exceed the cap and keeps every ENDED one', () => {
      const result = plan(
        [
          dir('live', file('tmp_1', 0, 100)),
          dir('old', file('1_0.mp4', 0, 30)),
          dir('new', file('1_0.mp4', 0, 30)),
        ],
        [
          row('live', 'LIVE'),
          row('old', 'ENDED', ['old/1_0.mp4']),
          row('new', 'ENDED', ['new/1_0.mp4']),
        ],
        50,
      );
      expect(result).toEqual({
        ...nothing,
        stopLive: ['live'],
        overCapBytes: 110,
      });
    });

    it('stops every LIVE recording when together they exceed the cap', () => {
      const result = plan(
        [dir('a', file('tmp_1', 0, 30)), dir('b', file('tmp_1', 0, 30))],
        [row('a', 'LIVE'), row('b', 'LIVE')],
        50,
      );
      expect(result).toEqual({
        ...nothing,
        stopLive: ['a', 'b'],
        overCapBytes: 10,
      });
    });

    it('evicts ENDED recordings, and stops nothing, when LIVE ones fit the cap', () => {
      const result = plan(
        [
          dir('live', file('tmp_1', 0, 40)),
          dir('ended', file('1_0.mp4', 0, 30)),
        ],
        [row('live', 'LIVE'), row('ended', 'ENDED', ['ended/1_0.mp4'])],
        50,
      );
      expect(result).toEqual({ ...nothing, evict: ['ended'] });
    });

    it('counts tmp_ files, which take disk space too', () => {
      const result = plan(
        [dir('a', file('1_0.mp4', 0, 30), file('tmp_2', 0, 30))],
        [row('a', 'ENDED')],
        50,
      );
      expect(result.evict).toEqual(['a']);
    });

    it('does not count a deleted broadcast’s directory, which goes anyway', () => {
      const result = plan(
        [
          dir('gone', file('1_0.mp4', 0, 100)),
          dir('a', file('1_0.mp4', 0, 30)),
        ],
        [row('a', 'ENDED', ['a/1_0.mp4'])],
        50,
      );
      expect(result).toEqual({ ...nothing, remove: ['gone'] });
    });

    it('stays put exactly at the cap', () => {
      const result = plan(
        [dir('a', file('1_0.mp4', 0, 50))],
        [row('a', 'ENDED', ['a/1_0.mp4'])],
        50,
      );
      expect(result).toEqual(nothing);
    });

    it('does not set files for an evicted broadcast', () => {
      const result = plan(
        [dir('a', file('1_0.mp4', 0, 100))],
        [row('a', 'ENDED')],
        50,
      );
      expect(result).toEqual({ ...nothing, evict: ['a'] });
    });
  });

  describe('per broadcast', () => {
    it('stops a LIVE recording that reaches the per-broadcast size', () => {
      const result = plan(
        [dir('big', file('tmp_1', 0, 20)), dir('small', file('tmp_1', 0, 19))],
        [row('big', 'LIVE'), row('small', 'LIVE')],
        GB,
        { bytes: 20 },
      );
      expect(result).toEqual({ ...nothing, stopLive: ['big'] });
    });

    it('stops a LIVE recording that has run for the per-broadcast time', () => {
      const started = (hoursAgo: number) =>
        new Date(NOW.getTime() - hoursAgo * HOUR);
      const result = plan(
        [dir('long', file('tmp_1')), dir('short', file('tmp_1'))],
        [
          row('long', 'LIVE', [], null, [], started(3)),
          row('short', 'LIVE', [], null, [], started(2.9)),
        ],
        GB,
        { ms: 3 * HOUR },
      );
      expect(result).toEqual({ ...nothing, stopLive: ['long'] });
    });

    it('leaves the recordings of ENDED broadcasts to eviction alone', () => {
      const result = plan(
        [dir('a', file('1_0.mp4', 0, 100))],
        [row('a', 'ENDED', ['a/1_0.mp4'], undefined, [], new Date(0))],
        GB,
        { bytes: 10, ms: 1 },
      );
      expect(result).toEqual(nothing);
    });
  });
});
