import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';

beforeEach(() => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response(null, { status: 401 })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

it('shows the service name and the broadcast list on the home route', () => {
  renderAt('/');
  expect(screen.getByRole('link', { name: 'Lime' })).toBeDefined();
  expect(screen.getByRole('heading', { name: '방송 목록' })).toBeDefined();
});

it('shows a not-found page for unknown routes', () => {
  renderAt('/no-such-page');
  expect(
    screen.getByRole('heading', { name: '페이지를 찾을 수 없습니다' }),
  ).toBeDefined();
});

it('offers login in the header when the session check answers 401', async () => {
  renderAt('/');
  expect(await screen.findByRole('link', { name: '로그인' })).toBeDefined();
});

it('restores the logged-in header from GET /api/auth/me', async () => {
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve(
      Response.json(
        url === '/api/auth/me'
          ? { id: 'u1', email: 'a@example.com', nickname: '불씨' }
          : [],
      ),
    ),
  );
  renderAt('/');
  expect(await screen.findByText('불씨')).toBeDefined();
  expect(
    screen.getByRole('button', { name: '불씨', expanded: false }),
  ).toBeDefined();
});
