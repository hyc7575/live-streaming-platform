import { expect, it } from 'vitest';
import type { ChatMessage } from './chat';
import {
  chatPlacement,
  chatUpTo,
  partStarts,
  VIEWER_DELAY_MS,
} from './replay-chat';

// 1부는 01:00:00부터 01:10:00까지이고, 송출이 끊긴 뒤 2부가
// 01:12:00에 시작한다.
const PART_1 = '2026-11-10T01:00:00.000Z';
const PART_2 = '2026-11-10T01:12:00.000Z';
const ONE_PART = [Date.parse(PART_1)];
const TWO_PARTS = [Date.parse(PART_1), Date.parse(PART_2)];

// `start`에 시작한 스트림의 `seconds` 시점에서 시청자 지연만큼 지난 뒤
// 보낸 메시지다.
const sentAt = (start: string, seconds: number) =>
  Date.parse(start) + seconds * 1000 + VIEWER_DELAY_MS;

function message(id: string, createdAtMs: number): ChatMessage {
  return {
    id,
    body: id,
    createdAt: new Date(createdAtMs).toISOString(),
    author: { id: 'u1', nickname: '불씨' },
  };
}

const ids = (messages: ChatMessage[]) => messages.map((m) => m.id);

it('places a message the viewer delay before it was sent', () => {
  expect(chatPlacement(sentAt(PART_1, 42), ONE_PART)).toEqual({
    part: 0,
    seconds: 42,
  });
  expect(chatPlacement(sentAt(PART_2, 5), TWO_PARTS)).toEqual({
    part: 1,
    seconds: 5,
  });
});

it('places chat from before the first part at its start', () => {
  expect(chatPlacement(sentAt(PART_1, -600), TWO_PARTS)).toEqual({
    part: 0,
    seconds: 0,
  });
});

it('places chat from a gap past the end of the earlier part', () => {
  expect(chatPlacement(sentAt(PART_1, 660), TWO_PARTS)).toEqual({
    part: 0,
    seconds: 660,
  });
});

it('shows chat sent up to the playhead, inclusive', () => {
  const messages = [
    message('at', sentAt(PART_1, 30)),
    message('after', sentAt(PART_1, 30) + 1),
  ];
  expect(ids(chatUpTo(messages, ONE_PART, { part: 0, seconds: 30 }))).toEqual([
    'at',
  ]);
  expect(
    ids(chatUpTo(messages, ONE_PART, { part: 0, seconds: 30.001 })),
  ).toEqual(['at', 'after']);
});

it('shows READY chat from the start, gap chat from the next part, and all of earlier parts', () => {
  const messages = [
    message('ready', sentAt(PART_1, -60)),
    message('part1', sentAt(PART_1, 100)),
    message('gap', sentAt(PART_1, 660)),
    message('part2', sentAt(PART_2, 10)),
  ];
  const at = (part: number, seconds: number) =>
    ids(chatUpTo(messages, TWO_PARTS, { part, seconds }));
  expect(at(0, 0)).toEqual(['ready']);
  expect(at(0, 100)).toEqual(['ready', 'part1']);
  expect(at(0, 600)).toEqual(['ready', 'part1']);
  expect(at(1, 0)).toEqual(['ready', 'part1', 'gap']);
  expect(at(1, 10)).toEqual(['ready', 'part1', 'gap', 'part2']);
});

it('shrinks what is shown when the playhead seeks back', () => {
  const messages = [
    message('early', sentAt(PART_1, 10)),
    message('late', sentAt(PART_1, 300)),
  ];
  expect(ids(chatUpTo(messages, ONE_PART, { part: 0, seconds: 400 }))).toEqual([
    'early',
    'late',
  ]);
  expect(ids(chatUpTo(messages, ONE_PART, { part: 0, seconds: 20 }))).toEqual([
    'early',
  ]);
});

it('lines nothing up without parts or with a part missing its start', () => {
  expect(partStarts([])).toBeNull();
  expect(
    partStarts([
      { file: 'b1/1_0.mp4', startedAt: PART_1 },
      { file: 'b1/1_1.mp4', startedAt: null },
    ]),
  ).toBeNull();
  expect(
    partStarts([
      { file: 'b1/1_0.mp4', startedAt: PART_1 },
      { file: 'b1/1_1.mp4', startedAt: PART_2 },
    ]),
  ).toEqual(TWO_PARTS);
});
