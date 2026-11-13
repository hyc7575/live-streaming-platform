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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const STANDBY = '/thumbnails/users/u1/standby.png?v=2';
const me = {
  id: 'u1',
  email: 'a@example.com',
  nickname: '불씨',
  standbyImageUrl: null as string | null,
};
const INVALID = '2MB 이하의 JPEG·PNG·WebP 이미지만 올릴 수 있습니다.';

// 각 `METHOD /api/path`에 표가 만든 Response로 답한다.
// 나머지는 404다. 호출된 키 목록을 돌려준다.
function stubApi(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(key);
    const route = routes[key];
    return Promise.resolve(
      route ? route() : new Response(null, { status: 404 }),
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

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]')!;
}

function pick(container: HTMLElement, file: File) {
  fireEvent.change(fileInput(container), { target: { files: [file] } });
}

const png = (bytes = 10) =>
  new File([new Uint8Array(bytes)], 'standby.png', { type: 'image/png' });

it.each([
  ['/studio', '내 방송'],
  ['/studio/channel', '내 채널'],
])(
  'shows both studio tabs on %s with %s as the open one',
  async (path, open) => {
    stubApi({
      'GET /api/auth/me': () => Response.json(me),
      'GET /api/me/broadcasts': () => Response.json([]),
    });
    renderAt(path);
    const tabs = await screen.findByRole('navigation', { name: '스튜디오' });
    expect(
      within(tabs).getByRole('link', { name: '내 방송' }).getAttribute('href'),
    ).toBe('/studio');
    expect(
      within(tabs).getByRole('link', { name: '내 채널' }).getAttribute('href'),
    ).toBe('/studio/channel');
    expect(
      within(tabs).getByRole('link', { current: 'page' }).textContent,
    ).toBe(open);
  },
);

it('sends an anonymous visitor to the login page', async () => {
  stubApi({ 'GET /api/auth/me': () => new Response(null, { status: 401 }) });
  renderAt('/studio/channel');
  expect(await screen.findByRole('heading', { name: '로그인' })).toBeDefined();
});

it('draws the nickname’s first letter until an image is uploaded, then shows it', async () => {
  const calls = stubApi({
    'GET /api/auth/me': () => Response.json(me),
    'PUT /api/me/standby-image': () =>
      Response.json({ ...me, standbyImageUrl: STANDBY }),
  });
  const { container } = renderAt('/studio/channel');
  await screen.findByRole('heading', { name: '기본 대기 이미지' });
  expect(within(screen.getByRole('main')).getByText('불')).toBeDefined();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
  expect(fileInput(container).accept).toBe('image/jpeg,image/png,image/webp');

  pick(container, png());
  expect(await screen.findByRole('button', { name: '삭제' })).toBeDefined();
  expect(container.querySelector('img')?.getAttribute('src')).toBe(STANDBY);
  expect(within(screen.getByRole('main')).queryByText('불')).toBeNull();
  expect(calls).toContain('PUT /api/me/standby-image');
});

it('shows that the upload is in progress', async () => {
  let answer: (res: Response) => void = () => {};
  stubApi({ 'GET /api/auth/me': () => Response.json(me) });
  const { container } = renderAt('/studio/channel');
  await screen.findByRole('heading', { name: '기본 대기 이미지' });
  // 업로드만 붙잡아 둔다. 다른 읽기(팔로우 목록이 아직 오는 중일 수 있다)는
  // 제 응답을 그대로 받으므로, `answer`가 그 요청들을 풀어 버릴 일이 없다.
  const routed = globalThis.fetch;
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    init?.method === 'PUT'
      ? new Promise<Response>((resolve) => (answer = resolve))
      : routed(url, init),
  );

  pick(container, png());
  const busy = await screen.findByRole('button', { name: '올리는 중…' });
  expect((busy as HTMLButtonElement).disabled).toBe(true);
  answer(Response.json({ ...me, standbyImageUrl: STANDBY }));
  expect(
    await screen.findByRole('button', { name: '이미지 선택' }),
  ).toBeDefined();
});

it.each([
  ['a file over 2MB', png(2 * 1024 * 1024 + 1)],
  ['a GIF', new File(['GIF89a'], 'a.gif', { type: 'image/gif' })],
])('refuses %s without sending it', async (_, file) => {
  const calls = stubApi({ 'GET /api/auth/me': () => Response.json(me) });
  const { container } = renderAt('/studio/channel');
  await screen.findByRole('heading', { name: '기본 대기 이미지' });

  pick(container, file);
  expect((await screen.findByRole('alert')).textContent).toBe(INVALID);
  expect(calls.filter((c) => c.includes('standby-image'))).toEqual([]);
});

it('shows the API’s message when it refuses the image', async () => {
  stubApi({
    'GET /api/auth/me': () => Response.json(me),
    'PUT /api/me/standby-image': () =>
      Response.json({ message: '형식이 맞지 않습니다.' }, { status: 400 }),
  });
  const { container } = renderAt('/studio/channel');
  await screen.findByRole('heading', { name: '기본 대기 이미지' });

  pick(container, png());
  expect((await screen.findByRole('alert')).textContent).toBe(
    '형식이 맞지 않습니다.',
  );
  expect(container.querySelector('img')).toBeNull();
});

it('deletes the image after confirming and goes back to the first letter', async () => {
  const calls = stubApi({
    'GET /api/auth/me': () =>
      Response.json({ ...me, standbyImageUrl: STANDBY }),
    'DELETE /api/me/standby-image': () => new Response(null, { status: 204 }),
  });
  const { container } = renderAt('/studio/channel');
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  const confirm = screen.getByRole('group', { name: '삭제 확인' });
  expect(calls).not.toContain('DELETE /api/me/standby-image');

  fireEvent.click(within(confirm).getByRole('button', { name: '삭제하기' }));
  expect(await within(screen.getByRole('main')).findByText('불')).toBeDefined();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
  expect(calls).toContain('DELETE /api/me/standby-image');
});
