import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { Broadcast } from './broadcasts';
import { CHAT_PAGE_LIMIT, type ChatMessage } from './chat';
import type { Comment } from './comments';
import { renderInDataRouter } from './testing/renderInDataRouter';

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
    thumbnailUrl: null,
    standbyImageUrl: null,
    streamer: { id: streamer.id, nickname: streamer.nickname },
    ...overrides,
  };
}

// Answers each `METHOD /api/path` from the table; anything else is a 404.
// A function value builds the whole Response, for an error with a body.
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
      typeof body === 'function'
        ? (body as () => Response)()
        : typeof body === 'number'
          ? new Response(null, { status: body })
          : Response.json(body),
    );
  });
  return Object.assign(calls, { bodies });
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

it('lists READY broadcasts under the 방송 준비 중 tab, searchable, linking to the watch page', async () => {
  const calls = stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts': [],
    'GET /api/broadcasts?status=READY': [
      broadcast({ id: 'b3', title: '곧 시작', status: 'READY' }),
      broadcast({ id: 'b4', title: '저녁 방송', status: 'READY' }),
    ],
  });
  renderAt('/?q=곧');
  fireEvent.click(await screen.findByRole('link', { name: '방송 준비 중' }));
  const card = await screen.findByRole('link', { name: /곧 시작/ });
  expect(within(card).getByText('방송 준비 중')).toBeDefined();
  expect(card.getAttribute('href')).toBe('/broadcasts/b3');
  expect(screen.queryByRole('link', { name: /저녁 방송/ })).toBeNull();
  expect(calls).toContain('GET /api/broadcasts?status=READY');
});

it('says so when no broadcast is getting ready', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts?status=READY': [],
  });
  renderAt('/?status=READY');
  expect(await screen.findByText('준비 중인 방송이 없습니다.')).toBeDefined();
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

const searchable = [
  broadcast({ id: 'b1', title: 'Minecraft 생존', status: 'LIVE' }),
  broadcast({
    id: 'b2',
    title: '저녁 라디오',
    status: 'LIVE',
    streamer: { id: 'u2', nickname: 'MoonLight' },
  }),
  broadcast({ id: 'b3', title: '어제 minecraft 건축', status: 'ENDED' }),
];

function shownTitles() {
  return screen
    .queryAllByRole('listitem')
    .map((item) => within(item).getAllByRole('paragraph')[0].textContent);
}

it('filters the list by title or streamer nickname, ignoring case and spaces', async () => {
  stubApi({ 'GET /api/auth/me': 401, 'GET /api/broadcasts': searchable });
  renderAt('/');
  await screen.findByText('저녁 라디오');
  const search = screen.getByRole('searchbox', { name: '방송 검색' });

  fireEvent.change(search, { target: { value: '  MINECRAFT ' } });
  expect(shownTitles()).toEqual(['Minecraft 생존', '어제 minecraft 건축']);

  fireEvent.change(search, { target: { value: 'moon' } });
  expect(shownTitles()).toEqual(['저녁 라디오']);

  fireEvent.change(search, { target: { value: '' } });
  expect(shownTitles()).toHaveLength(3);
});

it('restores the search from ?q= and keeps it across status tabs', async () => {
  const calls = stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts': searchable,
    'GET /api/broadcasts?status=ENDED': [searchable[2]],
  });
  renderAt('/?q=minecraft');
  await screen.findByText('Minecraft 생존');
  expect(
    screen.getByRole<HTMLInputElement>('searchbox', { name: '방송 검색' })
      .value,
  ).toBe('minecraft');
  expect(shownTitles()).toEqual(['Minecraft 생존', '어제 minecraft 건축']);

  const ended = screen.getByRole('link', { name: '방송 종료' });
  expect(ended.getAttribute('href')).toBe('/?status=ENDED&q=minecraft');
  fireEvent.click(ended);
  await screen.findByText('어제 minecraft 건축');
  expect(calls).toContain('GET /api/broadcasts?status=ENDED');
  expect(shownTitles()).toEqual(['어제 minecraft 건축']);
  expect(
    screen.getByRole<HTMLInputElement>('searchbox', { name: '방송 검색' })
      .value,
  ).toBe('minecraft');
});

it('says nothing matched and clears the search on request', async () => {
  stubApi({ 'GET /api/auth/me': 401, 'GET /api/broadcasts': searchable });
  renderAt('/?q=%20피아노%20');
  expect(
    await screen.findByText("'피아노'와 맞는 방송이 없습니다."),
  ).toBeDefined();
  expect(shownTitles()).toEqual([]);

  fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
  expect(shownTitles()).toHaveLength(3);
  const search = screen.getByRole<HTMLInputElement>('searchbox', {
    name: '방송 검색',
  });
  expect(search.value).toBe('');
  expect(document.activeElement).toBe(search);
});

it('keeps the empty-list notice when there is nothing to search', async () => {
  stubApi({ 'GET /api/auth/me': 401, 'GET /api/broadcasts': [] });
  renderAt('/?q=minecraft');
  expect(await screen.findByText('아직 공개된 방송이 없습니다.')).toBeDefined();
  expect(screen.queryByRole('button', { name: '검색어 지우기' })).toBeNull();
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

const PREPARING = '다시보기를 준비하는 중입니다.';

it('swaps in the replay once the recording shows up after the broadcast ended', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  try {
    vi.setSystemTime(new Date('2026-11-11T10:00:00.000Z'));
    const ended = {
      status: 'ENDED' as const,
      endedAt: '2026-11-11T10:00:00.000Z',
    };
    const routes: Record<string, unknown> = {
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ ...ended, recordingFiles: [] }),
    };
    const calls = stubApi(routes);
    renderAt('/broadcasts/b1');
    expect(await screen.findByText('방송이 끝났습니다.')).toBeDefined();
    expect(screen.getByText(PREPARING)).toBeDefined();

    routes['GET /api/broadcasts/b1'] = broadcast({
      ...ended,
      recordingFiles: ['b1/1_0.mp4'],
    });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    const replay = screen.getByLabelText('다시보기 화면');
    expect(replay.getAttribute('src')).toBe('/recordings/b1/1_0.mp4');
    expect(screen.queryByText(PREPARING)).toBeNull();

    const reads = () =>
      calls.filter((call) => call === 'GET /api/broadcasts/b1').length;
    const settled = reads();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(reads()).toBe(settled);
  } finally {
    vi.useRealTimers();
  }
});

it('stops waiting for a replay 90 s after the broadcast ended', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  try {
    vi.setSystemTime(new Date('2026-11-11T10:00:00.000Z'));
    const calls = stubApi({
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({
        status: 'ENDED',
        endedAt: '2026-11-11T10:00:00.000Z',
      }),
    });
    renderAt('/broadcasts/b1');
    expect(await screen.findByText(PREPARING)).toBeDefined();
    const reads = () =>
      calls.filter((call) => call === 'GET /api/broadcasts/b1').length;

    // Reads at 5 s … 85 s still fall inside the window.
    await act(() => vi.advanceTimersByTimeAsync(85_000));
    expect(reads()).toBe(18);
    expect(screen.getByText(PREPARING)).toBeDefined();

    // The read at 90 s finds the window closed: no replay, no more reads.
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(reads()).toBe(19);
    expect(screen.queryByText(PREPARING)).toBeNull();
    expect(screen.getByText('방송이 끝났습니다.')).toBeDefined();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(reads()).toBe(19);
  } finally {
    vi.useRealTimers();
  }
});

it('reads an ENDED broadcast once when it ended more than 90 s ago', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  try {
    vi.setSystemTime(new Date('2026-11-11T10:01:31.000Z'));
    const calls = stubApi({
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({
        status: 'ENDED',
        endedAt: '2026-11-11T10:00:00.000Z',
      }),
    });
    renderAt('/broadcasts/b1');
    expect(await screen.findByText('방송이 끝났습니다.')).toBeDefined();
    expect(screen.queryByText(PREPARING)).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(
      calls.filter((call) => call === 'GET /api/broadcasts/b1'),
    ).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
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

it('shows the logged-in streamer’s READY broadcast as 방송 준비 중', async () => {
  stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/me/broadcasts': [
      broadcast({ id: 'b3', title: '준비 중인 방송', status: 'READY' }),
    ],
  });
  renderAt('/studio');
  const card = await screen.findByRole('link', { name: /준비 중인 방송/ });
  expect(within(card).getByText('방송 준비 중')).toBeDefined();
});

it('opens the publish page from a 방송 준비 중 card and the watch page from the others', async () => {
  const mine = [
    broadcast({ id: 'b3', title: '준비 중인 방송', status: 'READY' }),
    broadcast({ id: 'b4', title: '송출 중인 방송', status: 'LIVE' }),
    broadcast({ id: 'b5', title: '끝난 방송', status: 'ENDED' }),
  ];
  stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/me/broadcasts': mine,
    'GET /api/broadcasts': mine.slice(1),
    'GET /api/broadcasts/b3': mine[0],
  });
  // The publish page uses useBlocker, which needs a data router.
  renderInDataRouter(
    ['/studio'],
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>,
  );
  const hrefOf = async (name: RegExp) =>
    (await screen.findByRole('link', { name })).getAttribute('href');
  expect(await hrefOf(/송출 중인 방송/)).toBe('/broadcasts/b4');
  expect(await hrefOf(/끝난 방송/)).toBe('/broadcasts/b5');
  fireEvent.click(await screen.findByRole('link', { name: /준비 중인 방송/ }));
  expect(
    await screen.findByRole('heading', { name: '준비 중인 방송' }),
  ).toBeDefined();
  expect(screen.getByRole('link', { name: '시청 화면 열기' })).toBeDefined();
  cleanup();

  // The public list shares the card and still opens the watch page.
  renderAt('/');
  expect(await hrefOf(/송출 중인 방송/)).toBe('/broadcasts/b4');
  expect(await hrefOf(/끝난 방송/)).toBe('/broadcasts/b5');
});

it('goes to the new broadcast’s publish page, and back skips the form', async () => {
  const created = broadcast({ id: 'b9', title: '새 방송', status: 'READY' });
  const calls = stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/me/broadcasts': [],
    'POST /api/broadcasts': created,
    'GET /api/broadcasts/b9': created,
  });
  let at = '';
  let go: ReturnType<typeof useNavigate> = () => undefined;
  function Probe() {
    at = useLocation().pathname;
    go = useNavigate();
    return null;
  }
  renderInDataRouter(
    ['/studio', '/studio/new'],
    <AuthProvider>
      <AppRoutes />
      <Probe />
    </AuthProvider>,
  );
  fireEvent.change(await screen.findByLabelText('제목'), {
    target: { value: '새 방송' },
  });
  fireEvent.click(screen.getByRole('button', { name: '만들기' }));
  expect(await screen.findByRole('heading', { name: '새 방송' })).toBeDefined();
  expect(at).toBe('/studio/broadcasts/b9');
  expect(calls.bodies['POST /api/broadcasts']).toMatchObject({
    title: '새 방송',
  });

  await act(() => go(-1));
  expect(await screen.findByRole('heading', { name: '내 방송' })).toBeDefined();
  expect(at).toBe('/studio');
});

it('tells a visitor that a READY broadcast has not started', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b3': broadcast({ id: 'b3', status: 'READY' }),
  });
  renderAt('/broadcasts/b3');
  expect(await screen.findByText('방송 준비 중입니다.')).toBeDefined();
  expect(screen.getByText('방송 준비 중')).toBeDefined();
});

it('lays the 방송 준비 중 notice over the streamer’s standby image', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b3': broadcast({
      id: 'b3',
      status: 'READY',
      standbyImageUrl: '/thumbnails/users/u1/standby.png?v=1',
    }),
  });
  const { container } = renderAt('/broadcasts/b3');
  await screen.findByText('방송 준비 중입니다.');
  const img = container.querySelector('img');
  expect(img?.getAttribute('src')).toBe('/thumbnails/users/u1/standby.png?v=1');
  expect(img?.getAttribute('alt')).toBe('');
});

it('swaps the 방송 준비 중 notice for the player once a status poll says LIVE', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    const routes: Record<string, unknown> = {
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status: 'READY' }),
    };
    stubApi(routes);
    renderAt('/broadcasts/b1');
    const notice = '방송 준비 중입니다.';
    await screen.findByText(notice);
    expect(screen.queryByLabelText('방송 화면')).toBeNull();

    routes['GET /api/broadcasts/b1'] = broadcast({
      status: 'LIVE',
      startedAt: new Date().toISOString(),
    });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByLabelText('방송 화면')).toBeDefined();
    expect(screen.queryByText(notice)).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('re-reads the list every 30 s so a LIVE card shows the newest thumbnail', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    const routes: Record<string, unknown> = {
      'GET /api/auth/me': 401,
      'GET /api/broadcasts': [
        broadcast({
          title: '낚시',
          thumbnailUrl: '/thumbnails/b1/live.jpg?v=1',
        }),
      ],
    };
    stubApi(routes);
    renderAt('/');
    const card = await screen.findByRole('link', { name: /낚시/ });
    expect(card.querySelector('img')?.getAttribute('src')).toBe(
      '/thumbnails/b1/live.jpg?v=1',
    );

    routes['GET /api/broadcasts'] = [
      broadcast({
        title: '낚시',
        thumbnailUrl: '/thumbnails/b1/live.jpg?v=2',
      }),
    ];
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(card.querySelector('img')?.getAttribute('src')).toBe(
      '/thumbnails/b1/live.jpg?v=2',
    );
  } finally {
    vi.useRealTimers();
  }
});

it('draws each card from the title initial and shows how long a LIVE card has run', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
  try {
    stubApi({
      'GET /api/auth/me': 401,
      'GET /api/broadcasts': [
        broadcast({
          id: 'b1',
          title: '지금 방송',
          status: 'LIVE',
          startedAt: '2026-11-10T11:58:30.000Z',
        }),
        broadcast({ id: 'b2', title: 'yesterday', status: 'ENDED' }),
      ],
    });
    renderAt('/');
    const live = await screen.findByRole('link', { name: /지금 방송/ });
    expect(within(live).getByText('지')).toBeDefined();
    const elapsed = within(live).getByText('1분');
    expect(elapsed.tagName).toBe('TIME');
    expect(elapsed.getAttribute('dateTime')).toBe('2026-11-10T11:58:30.000Z');

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(within(live).getByText('2분')).toBeDefined();

    const ended = screen.getByRole('link', { name: /yesterday/ });
    expect(within(ended).getByText('Y')).toBeDefined();
    expect(ended.querySelector('time')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('counts a LIVE broadcast’s running time up every second beside the badge', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
  try {
    stubApi({
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({
        status: 'LIVE',
        startedAt: '2026-11-10T10:59:58.000Z',
      }),
    });
    renderAt('/broadcasts/b1');
    const elapsed = await screen.findByText('1:00:02');
    expect(elapsed.getAttribute('dateTime')).toBe('2026-11-10T10:59:58.000Z');
    expect(elapsed.closest('[aria-live]')).toBeNull();
    const info = screen.getByRole('heading', { level: 1 }).parentElement;
    expect(within(info!).getByText('1:00:02')).toBe(elapsed);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(elapsed.textContent).toBe('1:00:03');
  } finally {
    vi.useRealTimers();
  }
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

function chat(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    body: `채팅 ${id}`,
    createdAt: '2026-11-10T01:00:00.000Z',
    author: { id: other.id, nickname: other.nickname },
    ...overrides,
  };
}

const COMMENTS = 'GET /api/broadcasts/b1/comments';
const CHAT = 'GET /api/broadcasts/b1/chat';

// The chat poll waits on setTimeout, so these tests fake it too and step
// time by hand instead of using findBy, whose own waiting would stall.
const fakeAllTimers = () =>
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

it.each(['READY', 'LIVE'] as const)(
  'shows live chat and no tabs while %s, with a login link for an anonymous visitor',
  async (status) => {
    const calls = stubApi({
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status }),
      [CHAT]: [chat('m1', { body: '안녕하세요' })],
    });
    renderAt('/broadcasts/b1');
    const panel = await screen.findByRole('complementary', { name: '채팅' });
    const line = (await within(panel).findByText('안녕하세요')).closest('p')!;
    expect(within(line).getByText(other.nickname)).toBeDefined();
    const time = line.querySelector('time')!;
    expect(time.getAttribute('dateTime')).toBe('2026-11-10T01:00:00.000Z');
    expect(time.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(within(panel).queryByRole('textbox')).toBeNull();
    expect(
      within(panel).getByRole('link', {
        name: '로그인하고 채팅에 참여해 보세요',
      }),
    ).toBeDefined();
    expect(calls).not.toContain(COMMENTS);
  },
);

it('polls chat every second for only what came after the last message', async () => {
  fakeAllTimers();
  try {
    const calls = stubApi({
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
      [CHAT]: [chat('m1'), chat('m2')],
      [`${CHAT}?after=m2`]: [
        chat('m3', { createdAt: '2026-11-10T01:00:05.000Z' }),
      ],
      [`${CHAT}?after=m3`]: [],
    });
    renderAt('/broadcasts/b1');
    await flush();
    expect(screen.getByText('채팅 m2')).toBeDefined();
    expect(calls.filter((c) => c.startsWith(CHAT))).toEqual([CHAT]);

    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(calls).not.toContain(`${CHAT}?after=m2`);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText('채팅 m3')).toBeDefined();

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(calls.filter((c) => c.startsWith(CHAT))).toEqual([
      CHAT,
      `${CHAT}?after=m2`,
      `${CHAT}?after=m3`,
    ]);
    expect(screen.getAllByText(/^채팅 m/).map((el) => el.textContent)).toEqual([
      '채팅 m1',
      '채팅 m2',
      '채팅 m3',
    ]);
  } finally {
    vi.useRealTimers();
  }
});

it('reads the next page at once when a chat page comes back full', async () => {
  fakeAllTimers();
  try {
    const page = Array.from({ length: CHAT_PAGE_LIMIT }, (_, i) =>
      chat(`m${String(i).padStart(3, '0')}`),
    );
    const last = page.at(-1)!.id;
    const calls = stubApi({
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
      [CHAT]: page,
      [`${CHAT}?after=${last}`]: [chat('n1', { body: '마지막' })],
    });
    renderAt('/broadcasts/b1');
    await flush();
    expect(screen.getByText('마지막')).toBeDefined();
    expect(calls.filter((c) => c.startsWith(CHAT))).toEqual([
      CHAT,
      `${CHAT}?after=${last}`,
    ]);
  } finally {
    vi.useRealTimers();
  }
});

it('sends a chat message and shows it before the next poll', async () => {
  fakeAllTimers();
  try {
    const calls = stubApi({
      'GET /api/auth/me': other,
      'GET /api/me/follows': [],
      'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
      [CHAT]: [],
      'POST /api/broadcasts/b1/chat': chat('m1', { body: '안녕하세요' }),
    });
    renderAt('/broadcasts/b1');
    await flush();
    expect(
      screen.getByText('아직 채팅이 없습니다. 첫 채팅을 남겨 보세요.'),
    ).toBeDefined();
    const draft = screen.getByLabelText('채팅 쓰기');
    expect(screen.getByRole('button', { name: '보내기' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.change(draft, { target: { value: '안녕하세요' } });
    expect(screen.getByText('5/200')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    await flush();
    expect(screen.getByText('안녕하세요')).toBeDefined();
    expect(calls.bodies['POST /api/broadcasts/b1/chat']).toEqual({
      body: '안녕하세요',
    });
    expect(draft).toHaveProperty('value', '');
    expect(calls).not.toContain(`${CHAT}?after=m1`);
  } finally {
    vi.useRealTimers();
  }
});

it('shows the API’s message when chat refuses a message with 409', async () => {
  stubApi({
    'GET /api/auth/me': other,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
    [CHAT]: [],
    'POST /api/broadcasts/b1/chat': () =>
      Response.json(
        { message: '끝난 방송에는 채팅을 보낼 수 없습니다.' },
        { status: 409 },
      ),
  });
  renderAt('/broadcasts/b1');
  fireEvent.change(await screen.findByLabelText('채팅 쓰기'), {
    target: { value: '늦었나요' },
  });
  fireEvent.click(screen.getByRole('button', { name: '보내기' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    '끝난 방송에는 채팅을 보낼 수 없습니다.',
  );
});

it('offers no edit or delete on chat, not even on the viewer’s own message', async () => {
  stubApi({
    'GET /api/auth/me': other,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
    [CHAT]: [
      chat('m1', {
        body: '스트리머 채팅',
        author: { id: streamer.id, nickname: streamer.nickname },
      }),
      chat('m2', { body: '내 채팅' }),
    ],
  });
  renderAt('/broadcasts/b1');
  const mine = (await screen.findByText('내 채팅')).closest('li')!;
  const theirs = screen.getByText('스트리머 채팅').closest('li')!;
  expect(within(mine).queryByRole('button')).toBeNull();
  expect(within(theirs).queryByRole('button')).toBeNull();
});

it('switches from chat to the 댓글 and 채팅 기록 tabs when the broadcast ends, without a reload', async () => {
  fakeAllTimers();
  try {
    const routes: Record<string, unknown> = {
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status: 'LIVE' }),
      [CHAT]: [chat('m1', { body: '방송 중 채팅' })],
      [`${CHAT}?after=m1`]: [],
      [COMMENTS]: [comment({ body: '잘 봤습니다' })],
    };
    stubApi(routes);
    renderAt('/broadcasts/b1');
    await flush();
    expect(screen.getByRole('complementary', { name: '채팅' })).toBeDefined();

    routes['GET /api/broadcasts/b1'] = broadcast({
      status: 'ENDED',
      endedAt: '2026-11-09T00:00:00.000Z',
    });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    await flush();
    expect(screen.queryByRole('complementary', { name: '채팅' })).toBeNull();
    const tab = screen.getByRole('tab', { name: '댓글' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('잘 봤습니다')).toBeDefined();
  } finally {
    vi.useRealTimers();
  }
});

it('opens an ended broadcast on the 댓글 tab, with the chat log read-only behind the other tab', async () => {
  const calls = stubApi({
    'GET /api/auth/me': other,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
    [COMMENTS]: [comment({ body: '잘 봤습니다' })],
    [CHAT]: [chat('m1', { body: '방송 중 채팅' })],
  });
  renderAt('/broadcasts/b1');
  const comments = await screen.findByRole('tab', { name: '댓글' });
  const log = screen.getByRole('tab', { name: '채팅 기록' });
  expect(comments.getAttribute('aria-selected')).toBe('true');
  expect(log.getAttribute('aria-selected')).toBe('false');
  const commentPanel = screen.getByRole('tabpanel', { name: '댓글' });
  expect(comments.getAttribute('aria-controls')).toBe(commentPanel.id);
  expect(await within(commentPanel).findByText('잘 봤습니다')).toBeDefined();
  expect(within(commentPanel).getByLabelText('댓글 쓰기')).toBeDefined();
  expect(calls).not.toContain(CHAT);

  fireEvent.click(log);
  const logPanel = screen.getByRole('tabpanel', { name: '채팅 기록' });
  const line = (await within(logPanel).findByText('방송 중 채팅')).closest(
    'li',
  )!;
  expect(within(line).getByText(other.nickname)).toBeDefined();
  expect(within(logPanel).queryByRole('textbox')).toBeNull();
  expect(within(logPanel).queryByRole('button')).toBeNull();
  expect(screen.queryByRole('tabpanel', { name: '댓글' })).toBeNull();
});

it('moves between the ended broadcast’s tabs with the arrow, Home and End keys', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
    [COMMENTS]: [],
    [CHAT]: [],
  });
  renderAt('/broadcasts/b1');
  const comments = await screen.findByRole('tab', { name: '댓글' });
  const log = screen.getByRole('tab', { name: '채팅 기록' });
  const selected = () =>
    screen
      .getAllByRole('tab')
      .filter((t) => t.getAttribute('aria-selected') === 'true')
      .map((t) => t.textContent);
  expect([comments.tabIndex, log.tabIndex]).toEqual([0, -1]);

  comments.focus();
  fireEvent.keyDown(comments, { key: 'ArrowRight' });
  expect(selected()).toEqual(['채팅 기록']);
  expect(document.activeElement).toBe(log);
  expect([comments.tabIndex, log.tabIndex]).toEqual([-1, 0]);

  fireEvent.keyDown(log, { key: 'ArrowRight' });
  expect(selected()).toEqual(['댓글']);
  expect(document.activeElement).toBe(comments);
  fireEvent.keyDown(comments, { key: 'ArrowLeft' });
  expect(selected()).toEqual(['채팅 기록']);
  fireEvent.keyDown(log, { key: 'Home' });
  expect(selected()).toEqual(['댓글']);
  fireEvent.keyDown(comments, { key: 'End' });
  expect(selected()).toEqual(['채팅 기록']);
  expect(document.activeElement).toBe(log);
});

it('shows comments on an ended broadcast to an anonymous visitor with a login link instead of the form', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'POST /api/auth/login': other,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': broadcast({
      status: 'ENDED',
      title: '지난 방송',
    }),
    [COMMENTS]: [comment({ body: '잘 봤습니다' })],
  });
  renderAt('/broadcasts/b1');
  const panel = await screen.findByRole('tabpanel', { name: '댓글' });
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

it('re-reads comments every 5 s', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    const calls = stubApi({
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
      [COMMENTS]: [comment({ body: '첫 댓글' })],
    });
    const reads = () => calls.filter((call) => call === COMMENTS).length;
    renderAt('/broadcasts/b1');
    await screen.findByText('첫 댓글');
    const first = reads();
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(reads()).toBe(first);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(reads()).toBe(first + 1);
  } finally {
    vi.useRealTimers();
  }
});

it('offers 수정 and 삭제 only on the viewer’s own comments and marks edits', async () => {
  stubApi({
    'GET /api/auth/me': other,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
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
  expect(within(mine).getByRole('button', { name: '댓글 수정' })).toBeDefined();
  expect(within(mine).getByRole('button', { name: '댓글 삭제' })).toBeDefined();
  expect(within(mine).getByText('(수정됨)')).toBeDefined();
  expect(within(mine).getByText(other.nickname)).toBeDefined();
  expect(within(theirs).queryByRole('button')).toBeNull();
  expect(within(theirs).queryByText('(수정됨)')).toBeNull();
});

it('posts a comment and shows it without waiting for the next poll', async () => {
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': other,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
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

it('edits the viewer’s own comment', async () => {
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': other,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
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
});

it('deletes the viewer’s own comment only after confirming', async () => {
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': other,
    'GET /api/me/follows': [],
    'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
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
});
