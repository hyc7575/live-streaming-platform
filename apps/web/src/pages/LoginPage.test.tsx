import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AppRoutes } from '../AppRoutes';
import { AuthProvider } from '../auth/AuthProvider';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Answers like the API: anonymous until test-login succeeds.
function stubApi(accounts: string[] | 'error') {
  const calls: { url: string; body?: unknown }[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : {};
    calls.push({ url, body });
    if (url === '/api/auth/test-accounts') {
      return Promise.resolve(
        accounts === 'error'
          ? new Response(null, { status: 500 })
          : Response.json({ accounts }),
      );
    }
    if (url === '/api/auth/test-login') {
      const { account } = body as { account: string };
      return Promise.resolve(
        Response.json({
          id: `u-${account}`,
          email: `${account}@modak.test`,
          nickname: account === 'A' ? '스트리머 A' : '사용자 B',
        }),
      );
    }
    // Any other 401 would log the user out again (#78).
    if (url === '/api/me/follows' || url.startsWith('/api/broadcasts')) {
      return Promise.resolve(Response.json([]));
    }
    return Promise.resolve(new Response(null, { status: 401 }));
  });
  return calls;
}

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

it('offers streamer A and user B when the server lists both', async () => {
  stubApi(['A', 'B']);
  renderLogin();
  expect(
    await screen.findByRole('heading', { name: '테스트 계정으로 로그인' }),
  ).toBeDefined();
  expect(screen.getByRole('button', { name: '스트리머 A' })).toBeDefined();
  expect(screen.getByRole('button', { name: '사용자 B' })).toBeDefined();
});

it('hides the test accounts when the feature is off or the request fails', async () => {
  for (const accounts of [[], 'error'] as const) {
    const calls = stubApi(accounts === 'error' ? 'error' : [...accounts]);
    renderLogin();
    await vi.waitFor(() =>
      expect(calls.map((c) => c.url)).toContain('/api/auth/test-accounts'),
    );
    await screen.findByRole('button', { name: '로그인' });
    expect(screen.queryByText('테스트 계정으로 로그인')).toBeNull();
    expect(screen.queryByRole('button', { name: '스트리머 A' })).toBeNull();
    cleanup();
  }
});

it('logs in as the clicked account and goes to the broadcast list', async () => {
  const calls = stubApi(['A', 'B']);
  renderLogin();
  fireEvent.click(await screen.findByRole('button', { name: '사용자 B' }));
  expect(
    await screen.findByRole('heading', { name: '방송 목록' }),
  ).toBeDefined();
  expect(
    screen.getByRole('button', { name: '사용자 B', expanded: false }),
  ).toBeDefined();
  expect(calls).toContainEqual({
    url: '/api/auth/test-login',
    body: { account: 'B' },
  });
});
