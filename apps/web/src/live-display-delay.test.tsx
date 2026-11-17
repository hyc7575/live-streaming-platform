import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { Broadcast } from './broadcasts';
import type { DonationSummary } from './donations';
import { advanceClock, eventually, useFakeClock } from './testing/fakeClock';
import { preloadLazyPages } from './testing/preloadLazyPages';

// #249: LIVE가 된 직후 10초는 공개 화면에 "방송 준비 중"으로 보인다.
// 가짜 시계는 타이머만 바꾸고 Date.now()는 실제 시계다. 그래서 startedAt을
// 지금 기준으로 잡고, 지연 끝 타이머는 시계를 넘길 때만 불린다.

beforeAll(preloadLazyPages);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  useFakeClock();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const streamer = { id: 'u1', nickname: '불씨', avatarUrl: null };
const viewer = { id: 'u2', email: 'b@example.com', nickname: '구경꾼' };

function broadcast(overrides: Partial<Broadcast> = {}): Broadcast {
  return {
    id: 'b1',
    title: '저녁 방송',
    description: '',
    category: 'ETC',
    game: null,
    status: 'LIVE',
    startedAt: null,
    endedAt: null,
    disconnectedAt: null,
    createdAt: '2026-11-15T00:00:00.000Z',
    recordingFiles: [],
    recordingParts: [],
    thumbnailUrl: null,
    standbyImageUrl: null,
    streamer,
    ...overrides,
  };
}

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();

const noDonations: DonationSummary = {
  total: 0,
  count: 0,
  donations: [],
  ranking: [],
};

// 표는 호출마다 읽으므로 바꾸면 다음 응답이 바뀐다. 없는 키는 404다.
function renderAt(path: string, routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const answer = key in routes ? routes[key] : 404;
    return Promise.resolve(
      typeof answer === 'number'
        ? new Response(null, { status: answer })
        : Response.json(answer),
    );
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
  return routes;
}

const donationCount = (text: string) =>
  eventually(() =>
    within(screen.getByRole('region', { name: '후원' })).getByText(text),
  );

it('shows a broadcast that just went LIVE as 방송 준비 중 and swaps in the player at 10 seconds without waiting for the next poll', async () => {
  const routes = renderAt('/broadcasts/b1', {
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast({ startedAt: secondsAgo(2) }),
    'GET /api/broadcasts/b1/donations': noDonations,
  });
  await eventually(() => screen.getByText('방송 준비 중입니다.'));
  expect(screen.getByText('방송 준비 중')).toBeDefined();
  expect(screen.queryByLabelText('방송 화면')).toBeNull();
  // 경과 시간(<time>)과 "후원하기"도 READY처럼 없다.
  expect(document.querySelector('time')).toBeNull();
  expect(screen.queryByText('후원하기')).toBeNull();
  await donationCount('0건');

  // 지연 중에 온 후원은 배너로 띄우지 않는다.
  routes['GET /api/broadcasts/b1/donations'] = {
    total: 5000,
    count: 1,
    donations: [
      {
        id: 'd1',
        method: 'TOSS',
        amount: 5000,
        message: '',
        approvedAt: new Date().toISOString(),
        donor: { id: 'u3', nickname: '시청자' },
      },
    ],
    ranking: [],
  } satisfies DonationSummary;
  await advanceClock(5000);
  await donationCount('1건');
  expect(screen.queryByText('시청자님이 5,000원 후원')).toBeNull();
  expect(screen.getByText('방송 준비 중입니다.')).toBeDefined();

  // 시작 뒤 약 9초: 아직이다.
  await advanceClock(2000);
  expect(screen.getByText('방송 준비 중입니다.')).toBeDefined();

  // 시작 뒤 10초: 다음 조회(마운트 뒤 10초)보다 먼저 플레이어로 바뀐다.
  await advanceClock(1000);
  expect(screen.getByLabelText('방송 화면')).toBeDefined();
  expect(screen.queryByText('방송 준비 중입니다.')).toBeNull();
  expect(screen.queryByText('방송 준비 중')).toBeNull();
  expect(document.querySelector('time')).not.toBeNull();
  expect(screen.getAllByText('후원하기').length).toBeGreaterThan(0);
  expect(screen.queryByText('시청자님이 5,000원 후원')).toBeNull();
});

it('lets the owner end a broadcast that is still shown as 방송 준비 중', async () => {
  renderAt('/broadcasts/b1', {
    'GET /api/auth/me': { ...viewer, id: streamer.id },
    'GET /api/broadcasts/b1': broadcast({ startedAt: secondsAgo(1) }),
    'GET /api/broadcasts/b1/donations': noDonations,
  });
  await eventually(() => screen.getByText('방송 준비 중입니다.'));
  expect(
    screen.getAllByRole('button', { name: '방송 종료' }).length,
  ).toBeGreaterThan(0);
});

it('keeps a broadcast that just went LIVE out of the home LIVE group until its delay ends', async () => {
  const fresh = broadcast({
    id: 'fresh',
    title: '막 시작',
    startedAt: secondsAgo(2),
  });
  const old = broadcast({
    id: 'old',
    title: '한참 전',
    startedAt: secondsAgo(600),
  });
  const ready = broadcast({ id: 'ready', title: '준비', status: 'READY' });
  renderAt('/', {
    'GET /api/auth/me': 401,
    // API는 실제 상태로 묶어 LIVE(최근 시작 순) → READY 순으로 보낸다.
    'GET /api/broadcasts': [fresh, old, ready],
    'GET /api/broadcasts?status=LIVE': [fresh, old],
  });
  const grid = await eventually(() => {
    const title = screen.getByText('막 시작');
    return title.closest('ul') as HTMLElement;
  });
  const cards = () =>
    within(grid)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
  // 카드 글자는 썸네일 첫 글자 → 상태 배지 → 제목 순이다.
  expect(cards()[0]).toMatch(/LIVE.*한참 전/);
  expect(cards()[1]).toMatch(/방송 준비 중.*막 시작/);
  expect(cards()[1]).not.toMatch(/LIVE/);
  expect(cards()[2]).toMatch(/방송 준비 중.*준비/);

  await advanceClock(8000);
  expect(cards()[0]).toMatch(/LIVE.*막 시작/);
  expect(cards()[1]).toMatch(/LIVE.*한참 전/);
});

it('leaves a broadcast that just went LIVE out of the LIVE tab and the 비로그인 LIVE 중인 방송 panel', async () => {
  const fresh = broadcast({
    id: 'fresh',
    title: '막 시작',
    startedAt: secondsAgo(2),
  });
  renderAt('/?status=LIVE', {
    'GET /api/auth/me': 401,
    'GET /api/broadcasts?status=LIVE': [fresh],
  });
  await eventually(() => screen.getByText('지금 LIVE인 방송이 없습니다.'));
  await eventually(() => screen.getByText('LIVE 중인 방송이 없습니다.'));

  await advanceClock(8000);
  expect(screen.queryByText('지금 LIVE인 방송이 없습니다.')).toBeNull();
  expect(screen.queryByText('LIVE 중인 방송이 없습니다.')).toBeNull();
  expect(screen.getAllByText('막 시작').length).toBe(2);
});
