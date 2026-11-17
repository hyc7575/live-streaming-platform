import { expect, it } from 'vitest';
import {
  chatFeed,
  CHAT_HELD_LIMIT,
  EMPTY_CHAT_FEED,
  keepLatest,
  type ChatFeed,
  type ChatFeedAction,
  type ChatMessage,
} from './chat';

function message(id: string, createdAt: string): ChatMessage {
  return {
    id,
    body: id,
    createdAt,
    author: { id: 'u1', nickname: '불씨' },
    donation: null,
  };
}

const T1 = '2026-11-10T01:00:00.000Z';
const T2 = '2026-11-10T01:00:01.000Z';
const T3 = '2026-11-10T01:00:02.000Z';

const run = (...actions: ChatFeedAction[]): ChatFeed =>
  actions.reduce(chatFeed, EMPTY_CHAT_FEED);
const ids = (feed: ChatFeed) => feed.messages.map((m) => m.id);

it('keeps messages in (createdAt, id) order and moves the cursor to the last polled one', () => {
  const feed = run(
    { type: 'polled', page: [message('a', T1), message('c', T2)] },
    { type: 'polled', page: [message('b', T2), message('d', T3)] },
  );
  expect(ids(feed)).toEqual(['a', 'b', 'c', 'd']);
  expect(feed.cursor).toBe('d');
});

it('orders messages that share a createdAt by id', () => {
  const feed = run({
    type: 'polled',
    page: [message('b', T1), message('a', T1)],
  });
  expect(ids(feed)).toEqual(['a', 'b']);
});

it('drops a message it already has', () => {
  const page = [message('a', T1), message('b', T2)];
  const once = run({ type: 'polled', page });
  const twice = chatFeed(once, { type: 'polled', page });
  expect(ids(twice)).toEqual(['a', 'b']);
  expect(twice.messages).toBe(once.messages);
});

it('keeps the cursor on an empty poll', () => {
  const feed = run(
    { type: 'polled', page: [message('a', T1)] },
    { type: 'polled', page: [] },
  );
  expect(feed.cursor).toBe('a');
});

it('shows the viewer’s own post without moving the cursor past unpolled messages', () => {
  const feed = run(
    { type: 'polled', page: [message('a', T1)] },
    { type: 'added', message: message('mine', T3) },
  );
  expect(ids(feed)).toEqual(['a', 'mine']);
  expect(feed.cursor).toBe('a');
  const next = chatFeed(feed, {
    type: 'polled',
    page: [message('b', T2), message('mine', T3)],
  });
  expect(ids(next)).toEqual(['a', 'b', 'mine']);
  expect(next.cursor).toBe('mine');
});

// 실시간 화면은 들고 있는 메시지 수에 상한을 둔다(#213). cursor는 그대로라
// 다음 폴링은 버린 메시지를 다시 받지 않는다.
it('keeps only the newest messages once the feed holds more than the limit', () => {
  const page = Array.from({ length: CHAT_HELD_LIMIT + 5 }, (_, i) =>
    message(`m${String(i).padStart(3, '0')}`, T1),
  );
  const feed = keepLatest(run({ type: 'polled', page }), CHAT_HELD_LIMIT);
  expect(feed.messages).toHaveLength(CHAT_HELD_LIMIT);
  expect(feed.messages[0].id).toBe('m005');
  expect(feed.cursor).toBe(page.at(-1)!.id);
});

it('leaves a feed under the limit as it is', () => {
  const feed = run({ type: 'polled', page: [message('a', T1)] });
  expect(keepLatest(feed, CHAT_HELD_LIMIT)).toBe(feed);
});
