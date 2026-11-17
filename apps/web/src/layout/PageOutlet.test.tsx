import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppRoutes } from '../AppRoutes';
import { AuthProvider } from '../auth/AuthProvider';

// #226: 시청·송출·후원·충전 화면은 경로별 청크로 따로 내려받는다. 내려받는
// 동안과 실패했을 때 레이아웃(헤더·왼쪽 열)이 남는지 AppRoutes 그대로 본다.

// 충전 화면 청크가 도착하는 때를 테스트가 정한다.
const chargeChunk = vi.hoisted(() => {
  let arrive!: () => void;
  const arrived = new Promise<void>((resolve) => (arrive = resolve));
  return { arrive, arrived };
});

vi.mock('../pages/LimeChargePage', async () => {
  await chargeChunk.arrived;
  return { LimeChargePage: () => <h1>충전 화면</h1> };
});

// 배포로 해시가 바뀌었거나 네트워크가 끊겨 시청 화면 청크를 받지 못한다.
vi.mock('../pages/BroadcastPage', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

beforeEach(() => {
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve(
      Response.json(
        url === '/api/auth/me'
          ? { id: 'u1', email: 'a@example.com', nickname: '불씨' }
          : [],
      ),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

it('keeps the header and the side column while a split page is downloading', async () => {
  renderAt('/lime/charge');
  // 로그인 확인이 끝나 RequireAuth를 지나면 청크를 기다린다.
  expect(await screen.findByText('불씨')).toBeDefined();
  expect(screen.getByRole('link', { name: 'Lime' })).toBeDefined();
  expect(
    screen.getByRole('complementary', { name: '팔로우한 스트리머' }),
  ).toBeDefined();
  expect(screen.queryByRole('heading', { name: '충전 화면' })).toBeNull();

  await act(async () => {
    chargeChunk.arrive();
    await chargeChunk.arrived;
  });
  expect(
    await screen.findByRole('heading', { name: '충전 화면' }),
  ).toBeDefined();
  expect(screen.getByRole('link', { name: 'Lime' })).toBeDefined();
});

it('tells the viewer to reload, inside the layout, when a page chunk fails to load', async () => {
  // React가 잡은 오류를 콘솔에 남기는 것은 이 테스트에서 기대한 일이다.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const reload = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    reload,
  });

  renderAt('/broadcasts/b1');

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(
    '화면을 불러오지 못했습니다. 새로고침해 주세요.',
  );
  expect(screen.getByRole('link', { name: 'Lime' })).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
  expect(reload).toHaveBeenCalledOnce();
});

it('drops the reload notice once the viewer moves to another page', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  renderAt('/broadcasts/b1');
  await screen.findByRole('alert');

  fireEvent.click(screen.getByRole('link', { name: '방송 목록' }));

  expect(
    await screen.findByRole('heading', { name: '방송 목록' }),
  ).toBeDefined();
  expect(
    screen.queryByText('화면을 불러오지 못했습니다. 새로고침해 주세요.'),
  ).toBeNull();
});
