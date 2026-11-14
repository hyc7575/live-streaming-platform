import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { Broadcast } from './broadcasts';
import { SEARCH_BROADCAST_LIMIT, type SearchResult } from './search';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const streamer = { id: 'u1', nickname: '불씨' };

function broadcast(overrides: Partial<Broadcast>): Broadcast {
  return {
    id: 'b1',
    title: '방송',
    description: '',
    category: 'ETC',
    game: null,
    status: 'LIVE',
    startedAt: null,
    endedAt: null,
    disconnectedAt: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    recordingFiles: [],
    recordingParts: [],
    thumbnailUrl: null,
    standbyImageUrl: null,
    streamer,
    ...overrides,
  };
}

const EMPTY: SearchResult = { streamers: [], broadcasts: [], past: [] };

// 비로그인으로 연다. 각 `GET /api/path`에 표의 값으로 답하고 나머지는 404다.
function stubApi(routes: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(key);
    if (key === 'GET /api/auth/me') {
      return Promise.resolve(new Response(null, { status: 401 }));
    }
    if (!(key in routes)) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    const body = routes[key];
    return Promise.resolve(
      typeof body === 'number'
        ? new Response(null, { status: body })
        : Response.json(body),
    );
  });
  return calls;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const SEARCH_LOL = `GET /api/search?q=${encodeURIComponent('롤')}`;

it('shows streamers, broadcasts and past broadcasts in their own sections', async () => {
  stubApi({
    [SEARCH_LOL]: {
      streamers: [
        {
          id: 'u1',
          nickname: '불씨',
          avatarUrl: null,
          followerCount: 1234,
          liveBroadcastId: 'b1',
        },
      ],
      broadcasts: [broadcast({ id: 'b1', title: '랭크 돌린다' })],
      past: [broadcast({ id: 'b2', title: '어제 내전', status: 'ENDED' })],
    } satisfies SearchResult,
  });
  renderAt('/search?q=%EB%A1%A4');

  expect(
    await screen.findByRole('heading', { level: 1, name: "'롤' 검색 결과" }),
  ).toBeTruthy();
  expect(document.title).toBe("'롤' 검색 결과 - Lime");

  const streamers = screen.getByRole('region', { name: '스트리머' });
  const link = within(streamers).getByRole('link', { name: /불씨/ });
  expect(link.getAttribute('href')).toBe('/channels/u1');
  expect(link.textContent).toContain('팔로워 1,234명');
  expect(link.textContent).toContain('LIVE');

  expect(
    within(screen.getByRole('region', { name: '방송' })).getByText(
      '랭크 돌린다',
    ),
  ).toBeTruthy();
  expect(
    within(screen.getByRole('region', { name: '지난 방송' })).getByText(
      '어제 내전',
    ),
  ).toBeTruthy();
});

it('leaves out empty sections and notes a section that hit the limit', async () => {
  const many = Array.from({ length: SEARCH_BROADCAST_LIMIT }, (_, i) =>
    broadcast({ id: `b${i}`, title: `지난 ${i}`, status: 'ENDED' }),
  );
  stubApi({ [SEARCH_LOL]: { ...EMPTY, past: many } });
  renderAt('/search?q=%EB%A1%A4');

  const past = await screen.findByRole('region', { name: '지난 방송' });
  expect(within(past).getByText('최근 30개까지 보입니다.')).toBeTruthy();
  expect(screen.queryByRole('region', { name: '스트리머' })).toBeNull();
  expect(screen.queryByRole('region', { name: '방송' })).toBeNull();
});

it('offers the LIVE broadcasts when nothing matches', async () => {
  stubApi({
    [`GET /api/search?q=zzqx`]: EMPTY,
    'GET /api/broadcasts?status=LIVE': [
      broadcast({ id: 'b9', title: '지금 하는 방송' }),
    ],
  });
  renderAt('/search?q=zzqx');

  expect(
    await screen.findByText("'zzqx'와 맞는 결과가 없습니다."),
  ).toBeTruthy();
  const live = await screen.findByRole('region', { name: '지금 방송 중' });
  expect(within(live).getByText('지금 하는 방송')).toBeTruthy();
});

it('links to the list when nothing matches and nothing is LIVE', async () => {
  stubApi({
    [`GET /api/search?q=zzqx`]: EMPTY,
    'GET /api/broadcasts?status=LIVE': [],
  });
  renderAt('/search?q=zzqx');

  const home = await screen.findByRole('link', { name: '방송 목록으로 가기' });
  expect(home.getAttribute('href')).toBe('/');
});

it('asks for a query without calling the API when there is none', async () => {
  const calls = stubApi({});
  renderAt('/search?q=%20%20');

  expect(await screen.findByText('검색어를 입력하세요.')).toBeTruthy();
  expect(calls.some((c) => c.startsWith('GET /api/search'))).toBe(false);
});

it('says so when the search limit is hit', async () => {
  stubApi({ [SEARCH_LOL]: 429 });
  renderAt('/search?q=%EB%A1%A4');

  expect((await screen.findByRole('alert')).textContent).toBe(
    '검색을 너무 자주 했습니다. 잠시 후 다시 시도해 주세요.',
  );
});
