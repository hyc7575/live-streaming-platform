import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { Broadcast } from './broadcasts';
import type { Comment } from './comments';

beforeEach(() => {
  // jsdom's play() returns nothing; a browser's returns a promise.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    recordingFiles: [],
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

it('lists replays under the 다시보기 tab', async () => {
  const calls = stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts': [],
    'GET /api/replays': [
      broadcast({
        id: 'b2',
        title: '녹화된 방송',
        status: 'ENDED',
        recordingFiles: ['b2/1_0.mp4'],
      }),
    ],
  });
  renderAt('/');
  fireEvent.click(await screen.findByRole('link', { name: '다시보기' }));
  expect(await screen.findByText('녹화된 방송')).toBeDefined();
  expect(calls).toContain('GET /api/replays');
  expect(
    screen.getByRole('link', { name: '다시보기' }).getAttribute('aria-current'),
  ).toBe('page');
});

it('says so when there is nothing to replay', async () => {
  stubApi({ 'GET /api/auth/me': 401, 'GET /api/replays': [] });
  renderAt('/?status=REPLAY');
  expect(
    await screen.findByText('다시 볼 수 있는 방송이 없습니다.'),
  ).toBeDefined();
});

it('plays the recording of an ENDED broadcast under the ended notice', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast({
      status: 'ENDED',
      recordingFiles: ['b1/1_0.mp4', 'b1/1_1.mp4'],
    }),
  });
  renderAt('/broadcasts/b1');
  const replay = await screen.findByLabelText('다시보기 화면');
  expect(replay.getAttribute('src')).toBe('/recordings/b1/1_0.mp4');
  expect(screen.getByRole('button', { name: '2부' })).toBeDefined();
  expect(
    screen.getByText('방송이 끝났습니다. 녹화된 방송을 다시 볼 수 있습니다.'),
  ).toBeDefined();
});

it('says the broadcast ended when it has no recording', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
  });
  renderAt('/broadcasts/b1');
  expect(await screen.findByText('방송이 끝났습니다.')).toBeDefined();
  expect(screen.queryByLabelText('다시보기 화면')).toBeNull();
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
    // The badge beside the title; the player has its own LIVE indicator.
    const info = screen.getByRole('heading', { level: 1 }).parentElement;
    expect(within(info!).getByText('LIVE')).toBeDefined();

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

const HOWLING = /하울링/;

it('mutes the owner’s own broadcast and says why', async () => {
  stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
  });
  renderAt('/broadcasts/b1');
  await screen.findByRole('link', { name: '수정' });
  expect(screen.getByLabelText<HTMLVideoElement>('방송 화면').muted).toBe(true);
  expect(screen.getByText(HOWLING)).toBeDefined();
});

it.each([
  ['an anonymous viewer', 401],
  ['another user', { ...streamer, id: 'u2' }],
])('plays with sound and no howling notice for %s', async (_who, me) => {
  stubApi({
    'GET /api/auth/me': me,
    'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
  });
  renderAt('/broadcasts/b1');
  const video = await screen.findByLabelText<HTMLVideoElement>('방송 화면');
  await act(() => Promise.resolve());
  expect(video.muted).toBe(false);
  expect(screen.queryByText(HOWLING)).toBeNull();
});

function comment(overrides: Partial<Comment>): Comment {
  return {
    id: 'c1',
    body: '댓글',
    createdAt: '2026-11-10T01:00:00.000Z',
    updatedAt: '2026-11-10T01:00:00.000Z',
    author: { id: other.id, nickname: other.nickname },
    ...overrides,
  };
}

const COMMENTS = 'GET /api/broadcasts/b1/comments';

it('shows comments to an anonymous visitor with a login link instead of the form', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'POST /api/auth/login': other,
    'GET /api/broadcasts/b1': broadcast({
      status: 'ENDED',
      title: '지난 방송',
    }),
    [COMMENTS]: [comment({ body: '잘 봤습니다' })],
  });
  renderAt('/broadcasts/b1');
  const panel = await screen.findByRole('complementary', { name: '댓글' });
  expect(await within(panel).findByText('잘 봤습니다')).toBeDefined();
  expect(within(panel).queryByRole('textbox')).toBeNull();
  expect(within(panel).queryByRole('button', { name: '댓글 수정' })).toBeNull();

  fireEvent.click(
    within(panel).getByRole('link', { name: '로그인하고 댓글을 남겨 보세요' }),
  );
  fireEvent.change(await screen.findByLabelText('이메일'), {
    target: { value: other.email },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  expect(
    await screen.findByRole('heading', { name: '지난 방송' }),
  ).toBeDefined();
  expect(await screen.findByLabelText('댓글 쓰기')).toBeDefined();
});

it('re-reads comments every 1 s while LIVE and every 5 s once ENDED', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    const routes: Record<string, unknown> = {
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
      [COMMENTS]: [comment({ body: '첫 댓글' })],
    };
    const calls = stubApi(routes);
    const reads = () => calls.filter((call) => call === COMMENTS).length;
    renderAt('/broadcasts/b1');
    await screen.findByText('첫 댓글');
    const first = reads();

    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(reads()).toBe(first);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(reads()).toBe(first + 1);

    // The status poll answers ENDED at 5 s, after the comment reads at 2, 3,
    // 4 and 5 s; the new cadence starts with an immediate read.
    routes['GET /api/broadcasts/b1'] = broadcast({ status: 'ENDED' });
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(await screen.findByText('방송 종료')).toBeDefined();
    expect(reads()).toBe(first + 6);

    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(reads()).toBe(first + 6);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(reads()).toBe(first + 7);
  } finally {
    vi.useRealTimers();
  }
});

it('writes a LIVE comment as one chat line and an ENDED one as a board entry', async () => {
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
    [COMMENTS]: [comment({ body: '안녕하세요' })],
  };
  stubApi(routes);
  renderAt('/broadcasts/b1');
  const live = (await screen.findByText('안녕하세요')).closest('p')!;
  expect(within(live).getByText(other.nickname)).toBeDefined();
  cleanup();

  routes['GET /api/broadcasts/b1'] = broadcast({ status: 'ENDED' });
  renderAt('/broadcasts/b1');
  const ended = (await screen.findByText('안녕하세요')).closest('p')!;
  expect(within(ended).queryByText(other.nickname)).toBeNull();
});

it.each(['LIVE', 'ENDED'] as const)(
  'offers 수정 and 삭제 only on the viewer’s own comments and marks edits (%s)',
  async (status) => {
    stubApi({
      'GET /api/auth/me': other,
      'GET /api/broadcasts/b1': broadcast({ status }),
      [COMMENTS]: [
        comment({
          id: 'c1',
          body: '스트리머 댓글',
          author: { id: streamer.id, nickname: streamer.nickname },
        }),
        comment({
          id: 'c2',
          body: '내 댓글',
          updatedAt: '2026-11-10T01:05:00.000Z',
        }),
      ],
    });
    renderAt('/broadcasts/b1');
    const mine = (await screen.findByText('내 댓글')).closest('li')!;
    const theirs = screen.getByText('스트리머 댓글').closest('li')!;
    expect(
      within(mine).getByRole('button', { name: '댓글 수정' }),
    ).toBeDefined();
    expect(
      within(mine).getByRole('button', { name: '댓글 삭제' }),
    ).toBeDefined();
    expect(within(mine).getByText('(수정됨)')).toBeDefined();
    expect(within(theirs).queryByRole('button')).toBeNull();
    expect(within(theirs).queryByText('(수정됨)')).toBeNull();
  },
);

it('posts a comment and shows it without waiting for the next poll', async () => {
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': other,
    'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
    [COMMENTS]: [],
    'POST /api/broadcasts/b1/comments': comment({ body: '안녕하세요' }),
  };
  const calls = stubApi(routes);
  renderAt('/broadcasts/b1');
  expect(
    await screen.findByText('아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.'),
  ).toBeDefined();
  const draft = screen.getByLabelText('댓글 쓰기');
  expect(screen.getByRole('button', { name: '등록' })).toHaveProperty(
    'disabled',
    true,
  );

  routes[COMMENTS] = [comment({ body: '안녕하세요' })];
  fireEvent.change(draft, { target: { value: '안녕하세요' } });
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  expect(await screen.findByText('안녕하세요')).toBeDefined();
  expect(calls.bodies['POST /api/broadcasts/b1/comments']).toEqual({
    body: '안녕하세요',
  });
  expect(draft).toHaveProperty('value', '');
});

it.each(['LIVE', 'ENDED'] as const)(
  'edits the viewer’s own comment (%s)',
  async (status) => {
    const routes: Record<string, unknown> = {
      'GET /api/auth/me': other,
      'GET /api/broadcasts/b1': broadcast({ status }),
      [COMMENTS]: [comment({ body: '오타 잇음' })],
      'PATCH /api/comments/c1': comment({ body: '오타 있음' }),
    };
    const calls = stubApi(routes);
    renderAt('/broadcasts/b1');
    fireEvent.click(await screen.findByRole('button', { name: '댓글 수정' }));
    routes[COMMENTS] = [
      comment({ body: '오타 있음', updatedAt: '2026-11-10T01:05:00.000Z' }),
    ];
    fireEvent.change(screen.getByLabelText('댓글 수정'), {
      target: { value: '오타 있음' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('오타 있음')).toBeDefined();
    expect(screen.getByText('(수정됨)')).toBeDefined();
    expect(calls.bodies['PATCH /api/comments/c1']).toEqual({
      body: '오타 있음',
    });
  },
);

it.each(['LIVE', 'ENDED'] as const)(
  'deletes the viewer’s own comment only after confirming (%s)',
  async (status) => {
    const routes: Record<string, unknown> = {
      'GET /api/auth/me': other,
      'GET /api/broadcasts/b1': broadcast({ status }),
      [COMMENTS]: [comment({ body: '지울 댓글' })],
      'DELETE /api/comments/c1': 204,
    };
    const calls = stubApi(routes);
    renderAt('/broadcasts/b1');
    fireEvent.click(await screen.findByRole('button', { name: '댓글 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(calls).not.toContain('DELETE /api/comments/c1');

    fireEvent.click(screen.getByRole('button', { name: '댓글 삭제' }));
    expect(screen.getByText('이 댓글을 삭제할까요?')).toBeDefined();
    routes[COMMENTS] = [];
    fireEvent.click(screen.getByRole('button', { name: '삭제하기' }));
    expect(
      await screen.findByText('아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.'),
    ).toBeDefined();
    expect(calls).toContain('DELETE /api/comments/c1');
  },
);
