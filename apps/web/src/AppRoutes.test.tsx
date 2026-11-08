import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { AppRoutes } from './AppRoutes';

afterEach(cleanup);

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

it('shows the service name and the broadcast list on the home route', () => {
  renderAt('/');
  expect(screen.getByRole('link', { name: '모닥' })).toBeDefined();
  expect(screen.getByRole('heading', { name: 'LIVE 방송' })).toBeDefined();
});

it('shows a not-found page for unknown routes', () => {
  renderAt('/no-such-page');
  expect(
    screen.getByRole('heading', { name: '페이지를 찾을 수 없습니다' }),
  ).toBeDefined();
});
