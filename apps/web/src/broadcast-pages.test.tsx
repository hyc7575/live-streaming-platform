import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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

const streamer = { id: 'u1', email: 'a@example.com', nickname: '불씨' };

function broadcast(overrides: Partial<Broadcast>): Broadcast {
  return {
    id: 'b1',
    title: '방송',
    description: '',
    status: 'LIVE',
    startedAt: null,
    endedAt: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    streamer: { id: streamer.id, nickname: streamer.nickname },
    ...overrides,
  };
}

// Answers each `METHOD /api/path` from the table; anything else is a 404.
function stubApi(routes: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(key);
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
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

it('lists public broadcasts and refetches when a status filter is picked', async () => {
  const calls = stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts': [
      broadcast({ id: 'b1', title: '지금 방송', status: 'LIVE' }),
      broadcast({ id: 'b2', title: '어제 방송', status: 'ENDED' }),
    ],
    'GET /api/broadcasts?status=ENDED': [
      broadcast({ id: 'b2', title: '어제 방송', status: 'ENDED' }),
    ],
  });
  renderAt('/');
  const live = await screen.findByRole('link', { name: /지금 방송/ });
  expect(within(live).getByText('LIVE')).toBeDefined();
  expect(live.getAttribute('href')).toBe('/broadcasts/b1');

  fireEvent.click(screen.getByRole('link', { name: '방송 종료' }));
  await screen.findByRole('link', { name: /어제 방송/ });
  expect(screen.queryByRole('link', { name: /지금 방송/ })).toBeNull();
  expect(calls).toContain('GET /api/broadcasts?status=ENDED');
});

it('sends an anonymous visitor who clicks 방송 만들기 to the login page', async () => {
  stubApi({ 'GET /api/auth/me': 401, 'GET /api/broadcasts': [] });
  renderAt('/');
  fireEvent.click(await screen.findByRole('link', { name: '방송 만들기' }));
  expect(await screen.findByRole('heading', { name: '로그인' })).toBeDefined();
});

it('returns to the create form after logging in from it', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'POST /api/auth/login': streamer,
  });
  renderAt('/studio/new');
  await screen.findByRole('heading', { name: '로그인' });
  fireEvent.change(screen.getByLabelText('이메일'), {
    target: { value: streamer.email },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  expect(
    await screen.findByRole('heading', { name: '방송 만들기' }),
  ).toBeDefined();
});

it('shows the logged-in streamer’s READY broadcast as 방송 전', async () => {
  stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/me/broadcasts': [
      broadcast({ id: 'b3', title: '준비 중인 방송', status: 'READY' }),
    ],
  });
  renderAt('/studio');
  const card = await screen.findByRole('link', { name: /준비 중인 방송/ });
  expect(within(card).getByText('방송 전')).toBeDefined();
});

it('tells a visitor that a READY broadcast has not started', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b3': broadcast({ id: 'b3', status: 'READY' }),
  });
  renderAt('/broadcasts/b3');
  expect(
    await screen.findByText('아직 시작하지 않은 방송입니다.'),
  ).toBeDefined();
  expect(screen.getByText('방송 전')).toBeDefined();
});

it('says the broadcast does not exist on a 404', async () => {
  stubApi({ 'GET /api/auth/me': 401 });
  renderAt('/broadcasts/missing');
  expect(
    await screen.findByRole('heading', { name: '방송을 찾을 수 없습니다' }),
  ).toBeDefined();
});
