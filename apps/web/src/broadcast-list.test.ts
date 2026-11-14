import { expect, it } from 'vitest';
import { pickListView } from './broadcast-list';
import type { Broadcast } from './broadcasts';
import type { BroadcastCategory } from './categories';

function card(
  title: string,
  category: BroadcastCategory,
  nickname = '불씨',
): Broadcast {
  return {
    id: title,
    title,
    description: '',
    category,
    status: 'LIVE',
    startedAt: null,
    endedAt: null,
    disconnectedAt: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    recordingFiles: [],
    recordingParts: [],
    thumbnailUrl: null,
    standbyImageUrl: null,
    streamer: { id: 'u1', nickname },
  };
}

const list = [
  card('Minecraft 생존', 'GAME'),
  card('저녁 라디오', 'TALK', 'MoonLight'),
  card('어제 minecraft 건축', 'GAME'),
];

function titles(view: ReturnType<typeof pickListView>) {
  return view.kind === 'shown' ? view.broadcasts.map((b) => b.title) : view;
}

it('shows the whole list when no category or search is picked', () => {
  expect(titles(pickListView(list, null, ''))).toHaveLength(3);
});

it('keeps only the picked category', () => {
  expect(titles(pickListView(list, 'GAME', ''))).toEqual([
    'Minecraft 생존',
    '어제 minecraft 건축',
  ]);
});

it('narrows the category further by title or nickname, ignoring case and spaces', () => {
  expect(titles(pickListView(list, 'GAME', '  어제 MINECRAFT '))).toEqual([
    '어제 minecraft 건축',
  ]);
  expect(titles(pickListView(list, null, 'moon'))).toEqual(['저녁 라디오']);
});

it('says the tab is empty when no category is picked and the fetched list is empty', () => {
  expect(pickListView([], null, 'minecraft')).toEqual({ kind: 'empty' });
});

it('blames the category even when the fetched list itself is empty', () => {
  expect(pickListView([], 'GAME', 'minecraft')).toEqual({
    kind: 'noCategoryMatch',
    category: 'GAME',
  });
});

it('blames the category when it has no broadcast, even with a search', () => {
  expect(pickListView(list, 'MUSIC', 'minecraft')).toEqual({
    kind: 'noCategoryMatch',
    category: 'MUSIC',
  });
});

it('blames the search when the category has broadcasts but none match', () => {
  expect(pickListView(list, 'TALK', 'minecraft')).toEqual({
    kind: 'noQueryMatch',
  });
});
