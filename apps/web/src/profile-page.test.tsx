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
import type { AuthUser } from './auth/auth-context';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const me: AuthUser = {
  id: 'u1',
  email: 'a@example.com',
  nickname: '불씨',
  bio: '',
  standbyImageUrl: null,
  avatarUrl: null,
};
const AVATAR = '/thumbnails/users/u1/avatar.png?v=2';

interface Call {
  key: string;
  body: unknown;
}

// 각 `METHOD /api/path`에 그 함수가 만든 Response로 답한다.
// 나머지는 404다. 호출과 그 JSON 본문을 돌려준다.
function stubApi(routes: Record<string, (body: unknown) => Response>) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as unknown)
        : null;
    calls.push({ key, body });
    const route = routes[key];
    return Promise.resolve(
      route ? route(body) : new Response(null, { status: 404 }),
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

const header = () => screen.getByRole('banner');

it('saves the nickname and introduction, and the header follows', async () => {
  const calls = stubApi({
    'GET /api/auth/me': () => Response.json(me),
    'GET /api/me/follows': () => Response.json([]),
    'PATCH /api/me/profile': (body) =>
      Response.json({ ...me, ...(body as Partial<AuthUser>) }),
  });
  renderAt('/me/profile');
  const nickname = await screen.findByRole('textbox', { name: /닉네임/ });
  const save = screen.getByRole('button', { name: '저장' });
  expect(save).toHaveProperty('disabled', true);

  fireEvent.change(nickname, { target: { value: '새 닉네임' } });
  fireEvent.change(screen.getByRole('textbox', { name: /소개/ }), {
    target: { value: '저녁마다 방송합니다.' },
  });
  expect(screen.getByText('11/200')).toBeDefined();
  fireEvent.click(save);

  expect(await screen.findByText('저장했습니다.')).toBeDefined();
  expect(calls).toContainEqual({
    key: 'PATCH /api/me/profile',
    body: { nickname: '새 닉네임', bio: '저녁마다 방송합니다.' },
  });
  expect(
    within(header()).getByRole('button', { name: '새 닉네임' }),
  ).toBeDefined();
  expect(save).toHaveProperty('disabled', true);
});

it('shows the API’s sentence when a test account tries a new nickname', async () => {
  stubApi({
    'GET /api/auth/me': () => Response.json(me),
    'GET /api/me/follows': () => Response.json([]),
    'PATCH /api/me/profile': () =>
      Response.json(
        { message: '테스트 계정은 닉네임을 바꿀 수 없습니다.' },
        { status: 403 },
      ),
  });
  renderAt('/me/profile');
  fireEvent.change(await screen.findByRole('textbox', { name: /닉네임/ }), {
    target: { value: '바꾼 이름' },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    '테스트 계정은 닉네임을 바꿀 수 없습니다.',
  );
  expect(within(header()).getByRole('button', { name: '불씨' })).toBeDefined();
});

it('refuses an empty nickname without asking the API', async () => {
  const calls = stubApi({
    'GET /api/auth/me': () => Response.json(me),
    'GET /api/me/follows': () => Response.json([]),
  });
  renderAt('/me/profile');
  fireEvent.change(await screen.findByRole('textbox', { name: /닉네임/ }), {
    target: { value: '   ' },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/1~20자/);
  expect(calls.map((c) => c.key)).not.toContain('PATCH /api/me/profile');
});

it('uploads a profile image and shows it in the header', async () => {
  const calls = stubApi({
    'GET /api/auth/me': () => Response.json(me),
    'GET /api/me/follows': () => Response.json([]),
    'PUT /api/me/avatar': () => Response.json({ ...me, avatarUrl: AVATAR }),
  });
  const { container } = renderAt('/me/profile');
  await screen.findByRole('heading', { name: '프로필 이미지' });
  expect(header().querySelector('img')).toBeNull();
  const input =
    container.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, {
    target: {
      files: [new File([new Uint8Array(10)], 'a.png', { type: 'image/png' })],
    },
  });
  expect(await screen.findByRole('button', { name: '삭제' })).toBeDefined();
  expect(header().querySelector('img')?.getAttribute('src')).toBe(AVATAR);
  expect(calls.map((c) => c.key)).toContain('PUT /api/me/avatar');
});

it('shows the introduction and profile image on the channel page', async () => {
  stubApi({
    'GET /api/auth/me': () => new Response(null, { status: 401 }),
    'GET /api/broadcasts?status=LIVE': () => Response.json([]),
    'GET /api/streamers/u1': () =>
      Response.json({
        id: 'u1',
        nickname: '불씨',
        bio: '저녁마다 방송합니다.',
        avatarUrl: AVATAR,
        followerCount: 0,
        liveBroadcastId: null,
      }),
    'GET /api/streamers/u1/broadcasts': () => Response.json([]),
  });
  renderAt('/channels/u1');
  expect(await screen.findByText('저녁마다 방송합니다.')).toBeDefined();
  expect(
    screen.getByRole('main').querySelector('img')?.getAttribute('src'),
  ).toBe(AVATAR);
});
