import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { Broadcast } from './broadcasts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const streamer = { id: 'u1', nickname: '불씨' };
const viewer = {
  id: 'u2',
  email: 'b@example.com',
  nickname: '시청자',
  standbyImageUrl: null,
};

const endedBroadcast: Broadcast = {
  id: 'b1',
  title: '지난 방송',
  description: '',
  status: 'ENDED',
  startedAt: null,
  endedAt: null,
  disconnectedAt: null,
  createdAt: '2026-11-09T00:00:00.000Z',
  recordingFiles: [],
  recordingParts: [],
  thumbnailUrl: null,
  standbyImageUrl: null,
  streamer,
};

// Answers each `METHOD /api/path` from the table, which the test may change
// mid-way; a number is an empty response with that status, anything missing
// is a 404.
function stubApi(routes: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(key);
    const body = key in routes ? routes[key] : 404;
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

async function logInFromForm() {
  fireEvent.change(await screen.findByLabelText('이메일'), {
    target: { value: viewer.email },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
}

it('opens the login page when posting a comment answers 401, then returns to the broadcast', async () => {
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': viewer,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': endedBroadcast,
    'GET /api/broadcasts/b1/comments': [],
    // The session ended elsewhere (another tab logged out).
    'POST /api/broadcasts/b1/comments': 401,
    'POST /api/auth/login': viewer,
  };
  stubApi(routes);
  renderAt('/broadcasts/b1');

  fireEvent.change(await screen.findByLabelText('댓글 쓰기'), {
    target: { value: '안녕하세요' },
  });
  fireEvent.click(screen.getByRole('button', { name: '등록' }));

  // Before the fix the login page saw `authenticated` and bounced straight
  // back to the broadcast.
  expect(await screen.findByRole('heading', { name: '로그인' })).toBeDefined();
  expect(screen.getByRole('link', { name: '로그인' })).toBeDefined();

  await logInFromForm();
  expect(
    await screen.findByRole('heading', { name: '지난 방송' }),
  ).toBeDefined();
  expect(await screen.findByLabelText('댓글 쓰기')).toBeDefined();
  expect(
    screen.getByRole('button', { name: '시청자', expanded: false }),
  ).toBeDefined();
});

it('opens the login page when sending chat answers 401, then returns to the broadcast', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': { ...endedBroadcast, status: 'LIVE' },
    'GET /api/broadcasts/b1/chat': [],
    'POST /api/broadcasts/b1/chat': 401,
    'POST /api/auth/login': viewer,
  });
  renderAt('/broadcasts/b1');

  fireEvent.change(await screen.findByLabelText('채팅 쓰기'), {
    target: { value: '안녕하세요' },
  });
  fireEvent.click(screen.getByRole('button', { name: '보내기' }));
  expect(await screen.findByRole('heading', { name: '로그인' })).toBeDefined();

  await logInFromForm();
  expect(
    await screen.findByRole('heading', { name: '지난 방송' }),
  ).toBeDefined();
  expect(await screen.findByLabelText('채팅 쓰기')).toBeDefined();
});

it('keeps the comment being typed when another request answers 401', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': endedBroadcast,
    'GET /api/broadcasts/b1/comments': [],
    'PUT /api/streamers/u1/follow': 401,
  });
  renderAt('/broadcasts/b1');

  const draft = await screen.findByLabelText('댓글 쓰기');
  fireEvent.change(draft, { target: { value: '쓰던 댓글' } });
  fireEvent.click(screen.getByRole('button', { name: '팔로우' }));

  // The 401 logs the viewer out, but the text stays put.
  expect(
    await screen.findByRole('link', { name: '로그인하고 댓글을 남겨 보세요' }),
  ).toBeDefined();
  expect(screen.getByLabelText('댓글 쓰기')).toHaveProperty(
    'value',
    '쓰던 댓글',
  );
});

it.each([
  ['the login form', '/login'],
  ['a test account', '/login'],
])(
  'shows the wrong-credentials message on a 401 from %s and stays put',
  async (via) => {
    stubApi({
      'GET /api/auth/me': 401,
      'GET /api/auth/test-accounts': { accounts: ['A', 'B'] },
      'POST /api/auth/login': 401,
      'POST /api/auth/test-login': 401,
    });
    renderAt('/login');
    if (via === 'the login form') {
      await logInFromForm();
    } else {
      fireEvent.click(await screen.findByRole('button', { name: '사용자 B' }));
    }
    expect((await screen.findByRole('alert')).textContent).toBe(
      '이메일 또는 비밀번호가 맞지 않습니다.',
    );
    expect(screen.getByRole('heading', { name: '로그인' })).toBeDefined();
  },
);

it('offers a retry instead of the login page when GET /api/auth/me fails with 500', async () => {
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': 500,
    'GET /api/me/follows': [],
    'GET /api/me/broadcasts': [],
    'GET /api/broadcasts?status=LIVE': [],
  };
  stubApi(routes);
  renderAt('/studio');

  expect(
    await screen.findByText('로그인 상태를 확인하지 못했습니다.'),
  ).toBeDefined();
  expect(screen.queryByRole('heading', { name: '로그인' })).toBeNull();
  expect(screen.queryByRole('link', { name: '로그인' })).toBeNull();
  expect(
    screen.queryByRole('link', {
      name: '로그인하고 스트리머를 팔로우해 보세요',
    }),
  ).toBeNull();

  routes['GET /api/auth/me'] = viewer;
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('heading', { name: '내 방송' })).toBeDefined();
  expect(screen.getByText('시청자')).toBeDefined();
  expect(screen.queryByText('로그인 상태를 확인하지 못했습니다.')).toBeNull();
});
