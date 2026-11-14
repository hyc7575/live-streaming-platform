import type { ByteReader } from '../../src/recording/recording-info.js';

// OME 녹화를 대신할 만큼만 만든 ISO BMFF. 박스 헤더와
// 재생 시간을 읽는 hdlr, mdhd 필드만 있다.

export function box(type: string, ...children: Buffer[]): Buffer {
  const body = Buffer.concat(children);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

// 크기가 64비트인 박스. 4 GB가 넘는 mdat가 이렇다.
export function largeBox(type: string, ...children: Buffer[]): Buffer {
  const body = Buffer.concat(children);
  const head = Buffer.alloc(16);
  head.writeUInt32BE(1, 0);
  head.write(type, 4, 'latin1');
  head.writeBigUInt64BE(BigInt(16 + body.length), 8);
  return Buffer.concat([head, body]);
}

// 크기가 0인 박스. 파일 끝까지 이어진다.
export function boxToEnd(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

export function trak(
  handler: 'vide' | 'soun',
  timescale: number,
  duration: number,
  version: 0 | 1 = 0,
): Buffer {
  const mdhd = Buffer.alloc(version === 0 ? 24 : 36);
  mdhd.writeUInt8(version, 0);
  if (version === 0) {
    mdhd.writeUInt32BE(timescale, 12);
    mdhd.writeUInt32BE(duration, 16);
  } else {
    mdhd.writeUInt32BE(timescale, 20);
    mdhd.writeBigUInt64BE(BigInt(duration), 24);
  }
  const hdlr = Buffer.alloc(25);
  hdlr.write(handler, 8, 'latin1');
  return box(
    'trak',
    box('tkhd', Buffer.alloc(84)),
    box('mdia', box('mdhd', mdhd), box('hdlr', hdlr), box('minf')),
  );
}

// ftyp, free, moov, mdat. OME가 쓰는 순서다.
export function omeMp4(videoSeconds: number): Buffer {
  return Buffer.concat([
    box('ftyp', Buffer.from('isom\0\0\x02\0isomiso2avc1mp41', 'latin1')),
    box('free'),
    box(
      'moov',
      box('mvhd', Buffer.alloc(100)),
      trak('soun', 48_000, Math.round((videoSeconds + 1) * 48_000)),
      trak('vide', 90_000, Math.round(videoSeconds * 90_000)),
    ),
    box('mdat', Buffer.alloc(64)),
  ]);
}

export function bufferReader(buffer: Buffer): ByteReader {
  return (offset, length) =>
    Promise.resolve(buffer.subarray(offset, offset + length));
}
