import { z } from 'zod';

// One <file> of the info XML OME writes per recording transaction.
export interface RecordingInfoEntry {
  // Relative to the recordings root, like Broadcast.recordingFiles.
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

// OME may be rewriting the file while it is read, so anything malformed is
// skipped rather than thrown: the next tick reads it again.
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

// startTime is when OME opened the file and recordTime how long it kept it,
// but the file holds only the video it received in that span, so the video
// at 0 s is the end of the span minus the video's length. finishTime is not
// used: after an abrupt disconnect it lands well past the last frame.
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

// Reads `length` bytes at `offset`, fewer at the end of the file.
export type ByteReader = (offset: number, length: number) => Promise<Buffer>;

interface Box {
  type: string;
  body: number;
  end: number;
}

// The duration of the first video track of an MP4, from its mdhd, or null
// when there is none. Only box headers and the few bytes of hdlr and mdhd are
// read, so the size of mdat does not matter.
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
    // version and flags, then pre_defined, then handler_type.
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

// The boxes laid end to end in [start, end). A box that runs past `end`
// stops the walk, since nothing after it can be trusted.
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
