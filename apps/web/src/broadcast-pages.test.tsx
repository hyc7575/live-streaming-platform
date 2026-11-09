import {
  act,
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
// `bodies` keeps the request body each call sent, keyed the same way.
function stubApi(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const bodies: Record<string, unknown> = {};
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(key);
    if (typeof init?.body === 'string') bodies[key] = JSON.parse(init.body);
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
  return Object.assign(calls, { bodies });
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

const other = { id: 'u2', email: 'b@example.com', nickname: '타인' };

// Waits for the header to show who is logged in, so the assertions run after
// the auth state has settled rather than while it is still loading.
it.each([
  [
    'an anonymous visitor',
    401,
    () => screen.findByRole('link', { name: '로그인' }),
  ],
  ['another logged-in user', other, () => screen.findByText(other.nickname)],
])('hides 수정 and 삭제 from %s', async (_who, me, settled) => {
  stubApi({
    'GET /api/auth/me': me,
    'GET /api/broadcasts/b1': broadcast({
      status: 'ENDED',
      title: '남의 방송',
    }),
  });
  renderAt('/broadcasts/b1');
  await screen.findByRole('heading', { name: '남의 방송' });
  await settled();
  expect(screen.queryByRole('link', { name: '수정' })).toBeNull();
  expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
});

it('lets the streamer delete after confirming, then goes to 내 방송', async () => {
  const calls = stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast({
      status: 'ENDED',
      title: '지울 방송',
    }),
    'DELETE /api/broadcasts/b1': 204,
    'GET /api/me/broadcasts': [],
  });
  renderAt('/broadcasts/b1');
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  expect(calls).not.toContain('DELETE /api/broadcasts/b1');

  fireEvent.click(screen.getByRole('button', { name: '삭제하기' }));
  expect(await screen.findByRole('heading', { name: '내 방송' })).toBeDefined();
  expect(calls).toContain('DELETE /api/broadcasts/b1');
});

it('keeps the broadcast when the streamer cancels the delete', async () => {
  const calls = stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast({ status: 'READY' }),
  });
  renderAt('/broadcasts/b1');
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.getByRole('button', { name: '삭제' })).toBeDefined();
  expect(calls).not.toContain('DELETE /api/broadcasts/b1');
});

it('lets the streamer delete a LIVE broadcast after a warning that it ends', async () => {
  const calls = stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
    'DELETE /api/broadcasts/b1': 204,
    'GET /api/me/broadcasts': [],
  });
  renderAt('/broadcasts/b1');
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  expect(
    screen.getByText(
      '송출 중인 방송입니다. 삭제하면 방송을 종료하고 되돌릴 수 없습니다.',
    ),
  ).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: '삭제하기' }));
  expect(await screen.findByRole('heading', { name: '내 방송' })).toBeDefined();
  expect(calls).toContain('DELETE /api/broadcasts/b1');
});

it('lets the streamer end a LIVE broadcast from the detail page', async () => {
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
    'POST /api/broadcasts/b1/end': broadcast({ status: 'ENDED' }),
  };
  const calls = stubApi(routes);
  renderAt('/broadcasts/b1');
  fireEvent.click(await screen.findByRole('button', { name: '방송 종료' }));
  expect(calls).not.toContain('POST /api/broadcasts/b1/end');
  expect(
    screen.getByText(
      '방송을 종료할까요? 송출이 끊기고 이 방송은 다시 시작할 수 없습니다.',
    ),
  ).toBeDefined();

  routes['GET /api/broadcasts/b1'] = broadcast({ status: 'ENDED' });
  fireEvent.click(screen.getByRole('button', { name: '종료하기' }));
  expect(await screen.findByText('방송이 끝났습니다.')).toBeDefined();
  expect(calls).toContain('POST /api/broadcasts/b1/end');
  expect(screen.queryByRole('button', { name: '방송 종료' })).toBeNull();
});

it('says so when ending fails, and keeps the broadcast LIVE', async () => {
  stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
    'POST /api/broadcasts/b1/end': 502,
  });
  renderAt('/broadcasts/b1');
  fireEvent.click(await screen.findByRole('button', { name: '방송 종료' }));
  fireEvent.click(screen.getByRole('button', { name: '종료하기' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    '방송을 종료하지 못했습니다. 다시 시도하세요.',
  );
  expect(screen.getByRole('button', { name: '방송 종료' })).toBeDefined();
});

it.each(['READY', 'ENDED'] as const)(
  'offers no 방송 종료 on a %s broadcast',
  async (status) => {
    stubApi({
      'GET /api/auth/me': streamer,
      'GET /api/broadcasts/b1': broadcast({ status }),
    });
    renderAt('/broadcasts/b1');
    await screen.findByRole('button', { name: '삭제' });
    expect(screen.queryByRole('button', { name: '방송 종료' })).toBeNull();
  },
);

it('goes to 내 방송 when the broadcast was already deleted elsewhere', async () => {
  stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
    'GET /api/me/broadcasts': [],
  });
  renderAt('/broadcasts/b1');
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '삭제하기' }));
  expect(await screen.findByRole('heading', { name: '내 방송' })).toBeDefined();
});

it('edits the title and description from the detail page', async () => {
  const calls = stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast({
      status: 'ENDED',
      title: '원래 제목',
      description: '원래 설명',
    }),
    'PATCH /api/broadcasts/b1': broadcast({ title: '고친 제목' }),
  });
  renderAt('/broadcasts/b1');
  fireEvent.click(await screen.findByRole('link', { name: '수정' }));

  const title = await screen.findByLabelText<HTMLInputElement>('제목');
  expect(title.value).toBe('원래 제목');
  expect(screen.getByLabelText<HTMLTextAreaElement>('설명 (선택)').value).toBe(
    '원래 설명',
  );
  fireEvent.change(title, { target: { value: '고친 제목' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  // The stub serves the old detail again; the PATCH body is what must change.
  expect(
    await screen.findByRole('heading', { name: '원래 제목' }),
  ).toBeDefined();
  expect(calls).toContain('PATCH /api/broadcasts/b1');
  expect(calls.bodies['PATCH /api/broadcasts/b1']).toEqual({
    title: '고친 제목',
    description: '원래 설명',
  });
});

it('tells a non-owner who opens the edit URL that they lack permission', async () => {
  stubApi({
    'GET /api/auth/me': other,
    'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
  });
  renderAt('/studio/broadcasts/b1/edit');
  expect(
    await screen.findByRole('heading', { name: '권한이 없습니다' }),
  ).toBeDefined();
  expect(screen.queryByLabelText('제목')).toBeNull();
});

it.each([
  ['READY', true],
  ['LIVE', true],
  ['ENDED', false],
] as const)(
  'links the owner of a %s broadcast to the publish page: %s',
  async (status, shown) => {
    stubApi({
      'GET /api/auth/me': streamer,
      'GET /api/broadcasts/b1': broadcast({ status }),
    });
    renderAt('/broadcasts/b1');
    await screen.findByRole('link', { name: '수정' });
    const link = screen.queryByRole('link', { name: '송출 화면' });
    expect(link?.getAttribute('href') ?? null).toBe(
      shown ? '/studio/broadcasts/b1' : null,
    );
  },
);

it('switches a viewer to 방송이 끝났습니다 once a status poll says ENDED', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    const routes: Record<string, unknown> = {
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
    };
    const calls = stubApi(routes);
    renderAt('/broadcasts/b1');
    await screen.findByLabelText('방송 화면');

    routes['GET /api/broadcasts/b1'] = 500;
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByLabelText('방송 화면')).toBeDefined();
    expect(screen.getByText('LIVE')).toBeDefined();

    routes['GET /api/broadcasts/b1'] = broadcast({ status: 'ENDED' });
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(screen.queryByText('방송이 끝났습니다.')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(await screen.findByText('방송이 끝났습니다.')).toBeDefined();
    expect(screen.queryByLabelText('방송 화면')).toBeNull();
    expect(screen.getByText('방송 종료')).toBeDefined();

    const reads = () =>
      calls.filter((call) => call === 'GET /api/broadcasts/b1').length;
    const settled = reads();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(reads()).toBe(settled);
  } finally {
    vi.useRealTimers();
  }
});

it('rechecks the status right away when playback fails', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
  try {
    const routes: Record<string, unknown> = {
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
    };
    stubApi(routes);
    renderAt('/broadcasts/b1');
    const video = await screen.findByLabelText('방송 화면');

    routes['GET /api/broadcasts/b1'] = broadcast({ status: 'ENDED' });
    fireEvent.error(video);
    expect(await screen.findByText('방송이 끝났습니다.')).toBeDefined();
  } finally {
    vi.restoreAllMocks();
  }
});
