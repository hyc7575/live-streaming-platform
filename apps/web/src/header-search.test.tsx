import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import { searchPath, type SearchResult } from './search';
import { renderInDataRouter } from './testing/renderInDataRouter';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const EMPTY: SearchResult = { streamers: [], broadcasts: [], past: [] };

function stubApi() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(key);
    if (key === 'GET /api/auth/me') {
      return Promise.resolve(new Response(null, { status: 401 }));
    }
    if (key.startsWith('GET /api/search?')) {
      return Promise.resolve(Response.json(EMPTY));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  return calls;
}

function renderAt(...entries: string[]) {
  const calls = stubApi();
  const { router } = renderInDataRouter(
    entries,
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>,
  );
  return { calls, router };
}

const searchbox = () =>
  screen.getByRole<HTMLInputElement>('searchbox', { name: '검색' });

function search(text: string) {
  const input = searchbox();
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.form!);
}

const magnifier = () => screen.getByRole('button', { name: '검색' });
const closeButton = () => screen.queryByRole('button', { name: '닫기' });

it('pushes the results page for a trimmed query, and back returns to the watch page', async () => {
  const { router } = renderAt('/broadcasts/b1');

  search('  리그 ');

  await screen.findByRole('heading', { level: 1, name: "'리그' 검색 결과" });
  expect(router.state.location.pathname + router.state.location.search).toBe(
    searchPath('리그'),
  );
  expect(router.state.historyAction).toBe('PUSH');
  expect(searchbox().value).toBe('리그');

  await act(() => router.navigate(-1));
  expect(router.state.location.pathname).toBe('/broadcasts/b1');
  expect(searchbox().value).toBe('');
});

it('stays put and calls no search API for a blank query', () => {
  const { router, calls } = renderAt('/broadcasts/b1');
  const before = router.state.location;

  search('   ');

  expect(router.state.location).toBe(before);
  expect(calls.some((c) => c.startsWith('GET /api/search'))).toBe(false);
});

it('shows the current query on the results page and an empty box elsewhere', async () => {
  renderAt('/search?q=%20%EB%A6%AC%EA%B7%B8%20');
  expect(searchbox().value).toBe('리그');

  fireEvent.click(
    within(screen.getByRole('banner')).getByRole('link', { name: '방송 목록' }),
  );
  await waitFor(() => expect(searchbox().value).toBe(''));
});

it('follows the address when going back and forth between results', async () => {
  const { router } = renderAt(searchPath('a'), searchPath('b'));
  expect(searchbox().value).toBe('b');

  await act(() => router.navigate(-1));
  expect(searchbox().value).toBe('a');

  await act(() => router.navigate(1));
  expect(searchbox().value).toBe('b');
});

it('does not stack the same results twice when the query is searched again', async () => {
  const { router } = renderAt('/broadcasts/b1', searchPath('리그'));

  search('리그 ');
  await waitFor(() => expect(router.state.historyAction).toBe('REPLACE'));
  expect(router.state.location.search).toBe(`?q=${encodeURIComponent('리그')}`);

  await act(() => router.navigate(-1));
  expect(router.state.location.pathname).toBe('/broadcasts/b1');
});

it('opens the search row on the magnifier and closes it on Escape, focusing the magnifier', () => {
  renderAt('/broadcasts/b1');

  fireEvent.click(magnifier());
  expect(document.activeElement).toBe(searchbox());
  expect(closeButton()).not.toBeNull();

  fireEvent.change(searchbox(), { target: { value: '리그' } });
  fireEvent.keyDown(searchbox(), { key: 'Escape' });
  expect(closeButton()).toBeNull();
  expect(document.activeElement).toBe(magnifier());
  expect(searchbox().value).toBe('리그');
});

it('keeps the row open on an Escape that cancels a Korean composition', () => {
  renderAt('/broadcasts/b1');
  fireEvent.click(magnifier());

  fireEvent.keyDown(searchbox(), { key: 'Escape', isComposing: true });

  expect(closeButton()).not.toBeNull();
  expect(document.activeElement).toBe(searchbox());
});

it('closes the row on 닫기, focusing the magnifier', () => {
  renderAt('/broadcasts/b1');
  fireEvent.click(magnifier());

  fireEvent.click(closeButton()!);

  expect(closeButton()).toBeNull();
  expect(document.activeElement).toBe(magnifier());
});

it('closes the row when its search moves to the results page', async () => {
  renderAt('/broadcasts/b1');
  fireEvent.click(magnifier());

  search('리그');

  await screen.findByRole('heading', { level: 1, name: "'리그' 검색 결과" });
  expect(closeButton()).toBeNull();
});

it('leaves Escape to the browser while the row is closed, so it clears the box', () => {
  renderAt('/broadcasts/b1');

  const notPrevented = fireEvent.keyDown(searchbox(), { key: 'Escape' });

  expect(notPrevented).toBe(true);
});
