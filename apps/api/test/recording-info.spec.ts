import { describe, expect, it } from 'vitest';
import {
  parseRecordingInfo,
  readVideoSeconds,
  recordingStartedAt,
} from '../src/recording/recording-info.js';
import {
  box,
  boxToEnd,
  bufferReader,
  largeBox,
  omeMp4,
  trak,
} from './support/mp4.js';

const id = '00000000-0000-4000-8000-000000000001';

function fileEntry(
  sequence: number,
  fields: { recordTime?: string; startTime?: string } = {},
): string {
  const { recordTime = '15347', startTime = '2026-11-11T06:37:51.739+00:00' } =
    fields;
  return `  <file>
    <transactionId>AbCdEfGh12345678</transactionId>
    <id>${id}</id>
    <metadata />
    <vhost>default</vhost>
    <app>app</app>
    <stream>${id}</stream>
    <filePath><![CDATA[/${id}/AbCdEfGh12345678_${sequence}.mp4]]></filePath>
    <recordBytes>554136</recordBytes>
    <recordTime>${recordTime}</recordTime>
    <sequence>${sequence}</sequence>
    <lastSequence>false</lastSequence>
    <createdTime>2026-11-11T06:37:46.462+00:00</createdTime>
    <startTime>${startTime}</startTime>
    <finishTime>2026-11-11T06:38:37.912+00:00</finishTime>
  </file>`;
}

const xml = (...files: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<files>\n${files.join('\n')}\n</files>\n`;

describe('parseRecordingInfo', () => {
  it('reads each file’s path, start and record time', () => {
    expect(
      parseRecordingInfo(
        xml(
          fileEntry(0),
          fileEntry(1, {
            recordTime: '15480',
            startTime: '2026-11-11T06:38:49.479+00:00',
          }),
        ),
      ),
    ).toEqual([
      {
        file: `${id}/AbCdEfGh12345678_0.mp4`,
        startTime: new Date('2026-11-11T06:37:51.739Z'),
        recordTimeMs: 15347,
      },
      {
        file: `${id}/AbCdEfGh12345678_1.mp4`,
        startTime: new Date('2026-11-11T06:38:49.479Z'),
        recordTimeMs: 15480,
      },
    ]);
  });

  it('skips a file with a malformed field', () => {
    const entries = parseRecordingInfo(
      xml(
        fileEntry(0, { recordTime: '-3' }),
        fileEntry(1, { startTime: 'yesterday' }),
        fileEntry(2),
      ),
    );
    expect(entries.map((entry) => entry.file)).toEqual([
      `${id}/AbCdEfGh12345678_2.mp4`,
    ]);
  });

  it('reads only the complete files of an XML cut off mid-rewrite', () => {
    const full = xml(fileEntry(0), fileEntry(1));
    const cut = full.slice(
      0,
      full.indexOf('<recordTime>', full.indexOf('_1.mp4')),
    );
    expect(parseRecordingInfo(cut).map((entry) => entry.file)).toEqual([
      `${id}/AbCdEfGh12345678_0.mp4`,
    ]);
  });

  it('reads nothing from something that is not OME’s XML', () => {
    expect(parseRecordingInfo('<info/>')).toEqual([]);
    expect(parseRecordingInfo('')).toEqual([]);
  });
});

describe('recordingStartedAt', () => {
  it('ends the video where the record time ends', () => {
    const entry = {
      file: `${id}/x_0.mp4`,
      startTime: new Date('2026-11-11T06:37:51.739Z'),
      recordTimeMs: 15347,
    };
    expect(recordingStartedAt(entry, 39743 / 3000)).toEqual(
      new Date('2026-11-11T06:37:53.838Z'),
    );
  });
});

describe('readVideoSeconds', () => {
  const read = (mp4: Buffer) => readVideoSeconds(bufferReader(mp4), mp4.length);

  it('reads the video track and not the audio track', async () => {
    expect(await read(omeMp4(13.248))).toBe(13.248);
  });

  it('finds a moov after a 64-bit mdat and reads a version 1 mdhd', async () => {
    const mp4 = Buffer.concat([
      box('ftyp'),
      largeBox('mdat', Buffer.alloc(100)),
      box('moov', trak('vide', 1000, 7_500_000_000, 1)),
    ]);
    expect(await read(mp4)).toBe(7_500_000);
  });

  it('reads past a moov to an mdat that runs to the end of the file', async () => {
    const mp4 = Buffer.concat([
      box('ftyp'),
      box('moov', trak('vide', 600, 3000)),
      boxToEnd('mdat', Buffer.alloc(100)),
    ]);
    expect(await read(mp4)).toBe(5);
  });

  it('gives null without a video track', async () => {
    expect(await read(box('moov', trak('soun', 48_000, 48_000)))).toBeNull();
  });

  it('gives null without a moov', async () => {
    expect(await read(Buffer.concat([box('ftyp'), box('mdat')]))).toBeNull();
    expect(await read(Buffer.alloc(64))).toBeNull();
  });

  it('gives null when the moov is cut off', async () => {
    const mp4 = omeMp4(13.248);
    expect(await read(mp4.subarray(0, mp4.length - 200))).toBeNull();
  });
});
