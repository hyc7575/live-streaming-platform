import { expect, it } from 'vitest';
import {
  chatFeed,
  EMPTY_CHAT_FEED,
  type ChatFeed,
  type ChatFeedAction,
  type ChatMessage,
} from './chat';

function message(id: string, createdAt: string): ChatMessage {
  return { id, body: id, createdAt, author: { id: 'u1', nickname: '불씨' } };
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

it('steps the cursor back when the last message is removed', () => {
  const feed = run(
    { type: 'polled', page: [message('a', T1), message('b', T2)] },
    { type: 'removed', id: 'b' },
  );
  expect(ids(feed)).toEqual(['a']);
  expect(feed.cursor).toBe('a');
  expect(chatFeed(feed, { type: 'removed', id: 'a' })).toEqual(EMPTY_CHAT_FEED);
});

it('keeps the cursor when an earlier message is removed, and ignores an unknown id', () => {
  const feed = run(
    { type: 'polled', page: [message('a', T1), message('b', T2)] },
    { type: 'removed', id: 'a' },
  );
  expect(feed).toEqual({ messages: [message('b', T2)], cursor: 'b' });
  expect(chatFeed(feed, { type: 'removed', id: 'zz' })).toBe(feed);
});
