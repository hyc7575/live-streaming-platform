import { z } from 'zod';

// OME가 녹화 트랜잭션마다 쓰는 info XML의 <file> 하나.
export interface RecordingInfoEntry {
  // Broadcast.recordingFiles처럼 녹화 루트 기준 상대 경로.
  file: string;
  startTime: Date;
  recordTimeMs: number;
}

const entrySchema = z
  .object({
    filePath: z.string().regex(/^\/[^/]+\/[^/]+$/),
    recordTime: z.string().regex(/^\d+$/),
    startTime: z.iso.datetime({ offset: true }),
  })
  .transform(({ filePath, recordTime, startTime }): RecordingInfoEntry => ({
    file: filePath.slice(1),
    startTime: new Date(startTime),
    recordTimeMs: Number(recordTime),
  }));

// 읽는 도중 OME가 파일을 다시 쓰고 있을 수 있다. 그래서 형식이 깨진 것은
// 던지지 않고 건너뛴다. 다음 틱에 다시 읽는다.
export function parseRecordingInfo(xml: string): RecordingInfoEntry[] {
  const entries: RecordingInfoEntry[] = [];
  for (const [, body = ''] of xml.matchAll(/<file>([\s\S]*?)<\/file>/g)) {
    const parsed = entrySchema.safeParse({
      filePath: tagText(body, 'filePath'),
      recordTime: tagText(body, 'recordTime'),
      startTime: tagText(body, 'startTime'),
    });
    if (parsed.success) entries.push(parsed.data);
  }
  return entries;
}

function tagText(body: string, tag: string): string | undefined {
  const match = new RegExp(
    `<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${tag}>`,
  ).exec(body);
  return match ? (match[1] ?? match[2] ?? '').trim() : undefined;
}

// startTime은 OME가 파일을 연 시각, recordTime은 연 채로 둔 시간이다.
// 하지만 파일에는 그 구간에 받은 영상만 있으므로, 영상의 0초 지점은
// 구간 끝에서 영상 길이를 뺀 시각이다. finishTime은 쓰지
// 않는다. 갑자기 끊기면 마지막 프레임보다 한참 뒤로 찍힌다.
export function recordingStartedAt(
  entry: RecordingInfoEntry,
  videoSeconds: number,
): Date {
  return new Date(
    Math.round(
      entry.startTime.getTime() + entry.recordTimeMs - videoSeconds * 1000,
    ),
  );
}

// `offset`에서 `length` 바이트를 읽는다. 파일 끝에서는 그보다 적게 읽는다.
export type ByteReader = (offset: number, length: number) => Promise<Buffer>;

interface Box {
  type: string;
  body: number;
  end: number;
}

// MP4의 첫 영상 트랙 길이를 mdhd에서 읽는다. 영상 트랙이 없으면
// null이다. box 헤더와 hdlr·mdhd의 몇 바이트만
// 읽으므로 mdat 크기는 상관없다.
export async function readVideoSeconds(
  read: ByteReader,
  size: number,
): Promise<number | null> {
  const moov = await findBox(read, 0, size, 'moov');
  if (!moov) return null;
  for (const trak of await listBoxes(read, moov.body, moov.end)) {
    if (trak.type !== 'trak') continue;
    const mdia = await findBox(read, trak.body, trak.end, 'mdia');
    if (!mdia) continue;
    const children = await listBoxes(read, mdia.body, mdia.end);
    const hdlr = children.find((box) => box.type === 'hdlr');
    const mdhd = children.find((box) => box.type === 'mdhd');
    if (!hdlr || !mdhd) continue;
    // version과 flags, 그다음 pre_defined, 그다음 handler_type.
    const handler = await read(hdlr.body + 8, 4);
    if (handler.toString('latin1') !== 'vide') continue;
    return mdhdSeconds(
      await read(mdhd.body, Math.min(32, mdhd.end - mdhd.body)),
    );
  }
  return null;
}

async function findBox(
  read: ByteReader,
  start: number,
  end: number,
  type: string,
): Promise<Box | undefined> {
  return (await listBoxes(read, start, end)).find((box) => box.type === type);
}

// [start, end) 안에 이어 붙은 box들. `end`를 넘어가는 box를 만나면
// 순회를 멈춘다. 그 뒤로는 아무것도 믿을 수 없기 때문이다.
async function listBoxes(
  read: ByteReader,
  start: number,
  end: number,
): Promise<Box[]> {
  const boxes: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const head = await read(offset, 16);
    if (head.length < 8) break;
    const type = head.toString('latin1', 4, 8);
    let size = head.readUInt32BE(0);
    let header = 8;
    if (size === 1) {
      if (head.length < 16) break;
      size = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    boxes.push({ type, body: offset + header, end: offset + size });
    offset += size;
  }
  return boxes;
}

function mdhdSeconds(mdhd: Buffer): number | null {
  const version = mdhd.length >= 1 ? mdhd.readUInt8(0) : -1;
  let timescale: number;
  let duration: number;
  if (version === 0 && mdhd.length >= 24) {
    timescale = mdhd.readUInt32BE(12);
    duration = mdhd.readUInt32BE(16);
    if (duration === 0xffffffff) return null;
  } else if (version === 1 && mdhd.length >= 32) {
    timescale = mdhd.readUInt32BE(20);
    duration = Number(mdhd.readBigUInt64BE(24));
  } else {
    return null;
  }
  return timescale > 0 ? duration / timescale : null;
}
