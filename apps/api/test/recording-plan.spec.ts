import { describe, expect, it } from 'vitest';
import {
  planRecordings,
  type RecordingDir,
  type RecordingFile,
  type RecordingPlan,
  type RecordingRow,
} from '../src/recording/recording-plan.js';

const GB = 1024 ** 3;

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
): RecordingRow {
  return { id, status, endedAt, recordingFiles, recordingStartedAt };
}

const at = (iso: string) => new Date(iso);

const nothing: RecordingPlan = {
  evict: [],
  remove: [],
  setFiles: [],
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
    expect(planRecordings(dirs, rows, GB)).toEqual({ ...nothing, ...expected });
  });

  describe('starts', () => {
    const t0 = '2026-11-10T00:00:00.123Z';
    const t1 = '2026-11-10T00:01:00.456Z';

    it('writes every part’s start in file order when all are known', () => {
      const plan = planRecordings(
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
      expect(plan.setFiles).toEqual([
        {
          id: 'a',
          files: ['a/1_0.mp4', 'a/1_1.mp4'],
          startedAt: [at(t0), at(t1)],
        },
      ]);
    });

    it('writes no start when any part’s start is unknown', () => {
      const plan = planRecordings(
        [dir('a', file('1_0.mp4', 10, 1, at(t0)), file('1_1.mp4', 20))],
        [row('a', 'ENDED')],
        GB,
      );
      expect(plan.setFiles).toEqual([
        { id: 'a', files: ['a/1_0.mp4', 'a/1_1.mp4'], startedAt: [] },
      ]);
    });

    it('backfills starts on a row whose files already match', () => {
      const plan = planRecordings(
        [dir('a', file('1_0.mp4', 10, 1, at(t0)))],
        [row('a', 'ENDED', ['a/1_0.mp4'])],
        GB,
      );
      expect(plan.setFiles).toEqual([
        { id: 'a', files: ['a/1_0.mp4'], startedAt: [at(t0)] },
      ]);
    });

    it('leaves a row whose files and starts both match', () => {
      const plan = planRecordings(
        [dir('a', file('1_0.mp4', 10, 1, at(t0)))],
        [row('a', 'ENDED', ['a/1_0.mp4'], undefined, [at(t0)])],
        GB,
      );
      expect(plan).toEqual(nothing);
    });

    it('clears the starts with the files when the directory is gone', () => {
      const plan = planRecordings(
        [],
        [row('a', 'ENDED', ['a/1_0.mp4'], undefined, [at(t0)])],
        GB,
      );
      expect(plan.setFiles).toEqual([{ id: 'a', files: [], startedAt: [] }]);
    });

    it('evicts a row with starts without setting it', () => {
      const plan = planRecordings(
        [dir('a', file('1_0.mp4', 10, 100, at(t0)))],
        [row('a', 'ENDED', ['a/1_0.mp4'], undefined, [at(t0)])],
        50,
      );
      expect(plan).toEqual({ ...nothing, evict: ['a'] });
    });
  });

  describe('cap', () => {
    const endedAt = (day: number) => new Date(`2026-11-0${day}T00:00:00Z`);

    it('evicts ENDED recordings, oldest end first, until under the cap', () => {
      const plan = planRecordings(
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
      expect(plan).toEqual({ ...nothing, evict: ['old'] });
    });

    it('never evicts a LIVE recording and reports what stays over', () => {
      const plan = planRecordings(
        [
          dir('live', file('tmp_1', 0, 100)),
          dir('ended', file('1_0.mp4', 0, 30)),
        ],
        [row('live', 'LIVE'), row('ended', 'ENDED', ['ended/1_0.mp4'])],
        50,
      );
      expect(plan).toEqual({ ...nothing, evict: ['ended'], overCapBytes: 50 });
    });

    it('counts tmp_ files, which take disk space too', () => {
      const plan = planRecordings(
        [dir('a', file('1_0.mp4', 0, 30), file('tmp_2', 0, 30))],
        [row('a', 'ENDED')],
        50,
      );
      expect(plan.evict).toEqual(['a']);
    });

    it('does not count a deleted broadcast’s directory, which goes anyway', () => {
      const plan = planRecordings(
        [
          dir('gone', file('1_0.mp4', 0, 100)),
          dir('a', file('1_0.mp4', 0, 30)),
        ],
        [row('a', 'ENDED', ['a/1_0.mp4'])],
        50,
      );
      expect(plan).toEqual({ ...nothing, remove: ['gone'] });
    });

    it('stays put exactly at the cap', () => {
      const plan = planRecordings(
        [dir('a', file('1_0.mp4', 0, 50))],
        [row('a', 'ENDED', ['a/1_0.mp4'])],
        50,
      );
      expect(plan).toEqual(nothing);
    });

    it('does not set files for an evicted broadcast', () => {
      const plan = planRecordings(
        [dir('a', file('1_0.mp4', 0, 100))],
        [row('a', 'ENDED')],
        50,
      );
      expect(plan).toEqual({ ...nothing, evict: ['a'] });
    });
  });
});
