import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { Broadcast } from './broadcasts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TAGLINE =
  '설치 없이 브라우저로 화면이나 카메라를 방송하고, 누구나 로그인 없이 시청합니다.';

const streamerA = {
  id: 'u-A',
  email: 'A@modak.test',
  nickname: '스트리머 A',
  standbyImageUrl: null,
};

function broadcast(overrides: Partial<Broadcast>): Broadcast {
  return {
    id: 'b1',
    title: '저녁 라디오',
    description: '',
    status: 'LIVE',
    startedAt: null,
    endedAt: null,
    disconnectedAt: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    recordingFiles: [],
    recordingParts: [],
    thumbnailUrl: null,
    standbyImageUrl: null,
    streamer: { id: streamerA.id, nickname: streamerA.nickname },
    ...overrides,
  };
}

// API처럼 답한다. `me`는 /auth/me가 알려 주는 세션이다(없거나 실패면
// 상태 코드). test-login은 늘 스트리머 A로 성공한다.
function stubApi({
  me,
  accounts = ['A', 'B'],
  routes = {},
}: {
  me: number | typeof streamerA;
  accounts?: string[] | 'error';
  routes?: Record<string, unknown>;
}) {
  const calls: { url: string; body?: unknown }[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : {};
    calls.push({ url, body });
    const reply = (value: unknown) =>
      Promise.resolve(
        typeof value === 'number'
          ? new Response(null, { status: value })
          : Response.json(value),
      );
    if (url === '/api/auth/me') return reply(me);
    if (url === '/api/auth/test-accounts')
      return reply(accounts === 'error' ? 500 : { accounts });
    if (url === '/api/auth/test-login') return reply(streamerA);
    if (url in routes) return reply(routes[url]);
    if (url.endsWith('/donations'))
      return reply({ total: 0, count: 0, donations: [] });
    if (url === '/api/me/follows' || url.startsWith('/api/broadcasts'))
      return reply([]);
    return reply(404);
  });
  return calls;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

it('shows the tagline and test accounts to a logged-out visitor, and stays home after logging in', async () => {
  const calls = stubApi({ me: 401 });
  renderAt('/');
  expect(await screen.findByText(TAGLINE)).toBeDefined();
  expect(await screen.findByRole('button', { name: '사용자 B' })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: '스트리머 A' }));

  // 이름이 같은 테스트 계정 버튼이 아니라 헤더의 메뉴 버튼이다.
  expect(
    await screen.findByRole('button', { name: '스트리머 A', expanded: false }),
  ).toBeDefined();
  expect(calls).toContainEqual({
    url: '/api/auth/test-login',
    body: { account: 'A' },
  });
  expect(screen.getByRole('heading', { name: '방송 목록' })).toBeDefined();
  expect(screen.getByText(TAGLINE)).toBeDefined();
  expect(screen.queryByText('테스트 계정으로 로그인')).toBeNull();
});

it('has no test account area when the feature is off or the request fails', async () => {
  for (const accounts of [[], 'error'] as const) {
    const calls = stubApi({
      me: 401,
      accounts: accounts === 'error' ? 'error' : [...accounts],
    });
    renderAt('/');
    await vi.waitFor(() =>
      expect(calls.map((c) => c.url)).toContain('/api/auth/test-accounts'),
    );
    await screen.findByRole('link', { name: '로그인' });
    expect(screen.getByText(TAGLINE)).toBeDefined();
    expect(screen.queryByText('테스트 계정으로 로그인')).toBeNull();
    expect(screen.queryByRole('button', { name: '스트리머 A' })).toBeNull();
    cleanup();
  }
});

it('offers no test accounts when logged in or when the login state is unknown', async () => {
  for (const me of [streamerA, 500]) {
    stubApi({ me });
    renderAt('/');
    await screen.findByRole(
      'button',
      me === 500
        ? { name: '다시 시도' }
        : { name: '스트리머 A', expanded: false },
    );
    // 확인하기 전에 test-accounts 요청이 답할 시간을 준다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText(TAGLINE)).toBeDefined();
    expect(screen.queryByText('테스트 계정으로 로그인')).toBeNull();
    cleanup();
  }
});

it('names the tab after the screen, or the broadcast on the watch and publish pages', async () => {
  stubApi({
    me: 401,
    routes: { '/api/broadcasts/b1': broadcast({}) },
  });
  renderAt('/');
  await screen.findByRole('heading', { name: '방송 목록' });
  await waitFor(() => expect(document.title).toBe('방송 목록 - Lime'));
  cleanup();

  renderAt('/broadcasts/b1');
  await screen.findByRole('heading', { name: '저녁 라디오' });
  await waitFor(() => expect(document.title).toBe('저녁 라디오 - Lime'));
  cleanup();

  stubApi({
    me: streamerA,
    routes: { '/api/broadcasts/b1': broadcast({ status: 'ENDED' }) },
  });
  renderAt('/studio/broadcasts/b1');
  await screen.findByRole('heading', { name: '저녁 라디오' });
  await waitFor(() => expect(document.title).toBe('[송출] 저녁 라디오 - Lime'));
});
