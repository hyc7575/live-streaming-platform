import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { Broadcast } from './broadcasts';
import type { Donation, DonationSummary } from './donations';

// S5(#161): 시청 화면 플레이어 위 새 후원 배너.

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  // waitFor·findBy가 기다릴 수 있게 가짜 시계도 실제 시간만큼 흐르게 둔다.
  vi.useFakeTimers({
    toFake: ['setInterval', 'setTimeout'],
    shouldAdvanceTime: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const streamer = { id: 'u1', nickname: '불씨' };
const viewer = { id: 'u2', email: 'b@example.com', nickname: '구경꾼' };

function broadcast(overrides: Partial<Broadcast> = {}): Broadcast {
  return {
    id: 'b1',
    title: '저녁 방송',
    description: '',
    category: 'ETC',
    game: null,
    status: 'LIVE',
    startedAt: '2026-11-15T00:00:00.000Z',
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

function donation(overrides: Partial<Donation> = {}): Donation {
  return {
    id: 'd1',
    method: 'TOSS',
    amount: 5000,
    message: '',
    approvedAt: '2026-11-15T00:10:00.000Z',
    donor: { id: 'u3', nickname: '시청자' },
    ...overrides,
  };
}

// 최신 순(API와 같다)으로 받은 후원을 응답으로 만든다.
const summaryOf = (list: Donation[]): DonationSummary => ({
  total: list.reduce((sum, d) => sum + d.amount, 0),
  count: list.length,
  donations: list,
});

const DONATIONS = 'GET /api/broadcasts/b1/donations';

// 각 `METHOD /api/path`에 표의 값으로 답하고, 숫자면 그 상태 코드다. 나머지는
// 404다. 표는 호출마다 읽으므로 바꾸면 다음 응답이 바뀐다.
function renderWatch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(key);
    const answer = key in routes ? routes[key] : 404;
    return Promise.resolve(
      typeof answer === 'number'
        ? new Response(null, { status: answer })
        : Response.json(answer),
    );
  });
  render(
    <MemoryRouter initialEntries={['/broadcasts/b1']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
  return { routes, calls };
}

// 화면이 첫 후원 응답을 받아 기준선을 잡을 때까지 기다린다. 첫 요청이
// 아직 오는 중이면 다음 다시 읽기는 건너뛰므로, 응답을 바꾸기 전에 부른다.
async function donationsLoaded() {
  const panel = await screen.findByRole('region', { name: '후원' });
  await within(panel).findByText(/^\d+건$/);
}

function nextPoll() {
  act(() => {
    vi.advanceTimersByTime(5000);
  });
}

const EARLIER = donation({ id: 'd0', amount: 1000, message: '먼저 온 후원' });
const CARD = donation({ id: 'd1', message: '화이팅' });
const LIME = donation({
  id: 'd2',
  method: 'LIME',
  amount: 3000,
  approvedAt: '2026-11-15T00:11:00.000Z',
  donor: { id: 'u4', nickname: '라임팬' },
});

it('shows each new donation over the live player for 6 seconds, but not the ones already there', async () => {
  const page = renderWatch({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summaryOf([EARLIER]),
  });
  const video = await screen.findByLabelText('방송 화면');
  await donationsLoaded();

  page.routes[DONATIONS] = summaryOf([LIME, CARD, EARLIER]);
  nextPoll();

  const card = await screen.findByText('시청자님이 5,000원 후원');
  const banners = card.closest('[aria-live="polite"]') as HTMLElement;
  // 전체 화면은 영상을 감싼 플레이어 컨테이너에 걸리므로 배너도 그 안에 있어야 보인다.
  expect(video.parentElement?.contains(banners)).toBe(true);
  expect(within(banners).getByText('화이팅')).toBeDefined();
  expect(within(banners).getByText('라임팬님이 3,000라임 후원')).toBeDefined();
  expect(within(banners).queryByText('먼저 온 후원')).toBeNull();

  // 배너 타이머 effect가 걸린 뒤에 시계를 넘긴다.
  await act(async () => {});
  act(() => {
    vi.advanceTimersByTime(6000);
  });
  await waitFor(() =>
    expect(screen.queryByText('시청자님이 5,000원 후원')).toBeNull(),
  );
  expect(screen.queryByText('라임팬님이 3,000라임 후원')).toBeNull();
});

it('shows no banner before the broadcast is LIVE or once it ended', async () => {
  for (const status of ['READY', 'ENDED'] as const) {
    const page = renderWatch({
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status }),
      [DONATIONS]: summaryOf([EARLIER]),
    });
    await screen.findByRole('heading', { level: 1, name: '저녁 방송' });
    await donationsLoaded();

    page.routes[DONATIONS] = summaryOf([CARD, EARLIER]);
    nextPoll();
    // 패널은 새 후원을 그리지만 배너는 없다.
    const panel = await screen.findByRole('region', { name: '후원' });
    expect(await within(panel).findByText('화이팅')).toBeDefined();
    expect(screen.queryByText('시청자님이 5,000원 후원')).toBeNull();
    cleanup();
  }
});

it('reads the donations once per poll for both the panel and the banner', async () => {
  const page = renderWatch({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summaryOf([]),
  });
  await screen.findByLabelText('방송 화면');
  await donationsLoaded();
  const reads = () => page.calls.filter((call) => call === DONATIONS).length;
  expect(reads()).toBe(1);

  page.routes[DONATIONS] = summaryOf([CARD]);
  nextPoll();
  await screen.findByText('시청자님이 5,000원 후원');
  expect(reads()).toBe(2);
  nextPoll();
  await waitFor(() => expect(reads()).toBe(3));
});

it('shows the donor their own donation too, next to the existing notice', async () => {
  const page = renderWatch({
    'GET /api/auth/me': viewer,
    'GET /api/me/lime': { balance: 0 },
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summaryOf([]),
  });
  const panel = await screen.findByRole('region', { name: '후원' });
  await donationsLoaded();

  page.routes[DONATIONS] = summaryOf([
    donation({ donor: { id: viewer.id, nickname: viewer.nickname } }),
  ]);
  // 결제 탭이 알린다. 5초 폴링을 기다리지 않고 바로 다시 읽는다.
  const tab = new BroadcastChannel('donations');
  tab.postMessage({ type: 'donated', broadcastId: 'b1' });
  tab.close();

  expect(await screen.findByText('구경꾼님이 5,000원 후원')).toBeDefined();
  expect(within(panel).getByRole('status').textContent).toBe(
    '후원이 반영되었습니다',
  );
});
