import {
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
import type { FollowedStreamer } from './follows/follows';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const viewer = { id: 'u-viewer', email: 'v@example.com', nickname: '구경꾼' };
const streamer = { id: 'u-streamer', nickname: '불씨' };

function broadcast(overrides: Partial<Broadcast> = {}): Broadcast {
  return {
    id: 'b1',
    title: '불씨의 방송',
    description: '',
    status: 'LIVE',
    startedAt: '2026-11-10T00:00:00.000Z',
    endedAt: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    recordingFiles: [],
    thumbnailUrl: null,
    streamer,
    ...overrides,
  };
}

const liveStreamer = (
  id: string,
  nickname: string,
  title: string,
): FollowedStreamer => ({
  id,
  nickname,
  live: {
    broadcastId: `b-${id}`,
    title,
    startedAt: '2026-11-10T00:00:00.000Z',
  },
});

// A fake API that keeps the follow list the way the server would: PUT adds,
// DELETE removes, and GET /api/me/follows answers what is there now.
function stubApi(options: {
  me?: typeof viewer | null;
  follows?: FollowedStreamer[];
  live?: Broadcast[];
  failFollow?: boolean;
}) {
  let me = options.me === undefined ? viewer : options.me;
  let follows = [...(options.follows ?? [])];
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(key);
    const json = (body: unknown) => Promise.resolve(Response.json(body));
    const status = (code: number) =>
      Promise.resolve(new Response(null, { status: code }));
    if (key === 'GET /api/auth/me') return me ? json(me) : status(401);
    if (key === 'POST /api/auth/login') {
      me = viewer;
      return json(viewer);
    }
    if (key === 'GET /api/me/follows') return me ? json(follows) : status(401);
    if (key === 'GET /api/broadcasts?status=LIVE') {
      return json(options.live ?? []);
    }
    if (key === 'GET /api/broadcasts/b1') return json(broadcast());
    if (key === 'GET /api/broadcasts/b1/donations') {
      return json({ total: 0, count: 0, donations: [] });
    }
    if (key === 'GET /api/broadcasts/b1/comments') return json([]);
    const follow = /^(PUT|DELETE) \/api\/streamers\/([^/]+)\/follow$/.exec(key);
    if (follow) {
      if (options.failFollow) return status(500);
      const [, method, id] = follow;
      follows = follows.filter((s) => s.id !== id);
      if (method === 'PUT' && id === streamer.id) {
        follows.push({ ...streamer, live: null });
      }
      return status(204);
    }
    return status(404);
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

const followPanel = () =>
  screen.findByRole('complementary', { name: '팔로우한 스트리머' });

it('lists followed streamers with the live ones linking to their broadcast', async () => {
  stubApi({
    follows: [
      liveStreamer('s1', '라임조아', '새벽 랭크'),
      { id: 's2', nickname: '코딩하는곰', live: null },
    ],
  });
  renderAt('/');
  const panel = await followPanel();
  const items = await within(panel).findAllByRole('listitem');
  expect(items.map((li) => li.textContent)).toEqual([
    '라라임조아새벽 랭크',
    '코코딩하는곰오프라인',
  ]);
  const live = within(panel).getByRole('link', { name: /라임조아/ });
  expect(live.getAttribute('href')).toBe('/broadcasts/b-s1');
  expect(live.getAttribute('title')).toBe('라임조아 · 새벽 랭크');
  expect(within(items[1]).queryByRole('link')).toBeNull();
});

it('says how to follow when the list is empty', async () => {
  stubApi({ follows: [] });
  renderAt('/');
  const panel = await followPanel();
  expect(
    await within(panel).findByText('방송을 보다가 팔로우하면 여기에 보입니다.'),
  ).toBeDefined();
});

it('shows anonymous visitors up to five LIVE broadcasts and a login link that comes back', async () => {
  const live = Array.from({ length: 6 }, (_, i) =>
    broadcast({
      id: `b-live-${i}`,
      title: `방송 ${i}`,
      streamer: { id: `s${i}`, nickname: `스트리머${i}` },
    }),
  );
  const calls = stubApi({ me: null, live });
  renderAt('/broadcasts/b1');
  const panel = await screen.findByRole('complementary', {
    name: 'LIVE 중인 방송',
  });
  expect(await within(panel).findAllByRole('listitem')).toHaveLength(5);
  expect(calls).not.toContain('GET /api/me/follows');

  fireEvent.click(
    within(panel).getByRole('link', {
      name: '로그인하고 스트리머를 팔로우해 보세요',
    }),
  );
  fireEvent.change(await screen.findByLabelText('이메일'), {
    target: { value: viewer.email },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  expect(
    await screen.findByRole('heading', { name: '불씨의 방송' }),
  ).toBeDefined();
  expect(await followPanel()).toBeDefined();
});

it('follows from the watch page and the panel shows it at once', async () => {
  const calls = stubApi({ follows: [] });
  renderAt('/broadcasts/b1');
  const button = await screen.findByRole('button', { name: '팔로우' });
  expect(button.getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(button);
  const following = await screen.findByRole('button', { name: '팔로잉' });
  expect(following.getAttribute('aria-pressed')).toBe('true');
  const panel = await followPanel();
  expect(await within(panel).findByText('불씨')).toBeDefined();
  expect(calls).toContain(`PUT /api/streamers/${streamer.id}/follow`);

  fireEvent.click(following);
  expect(await screen.findByRole('button', { name: '팔로우' })).toBeDefined();
  expect(
    await within(panel).findByText('방송을 보다가 팔로우하면 여기에 보입니다.'),
  ).toBeDefined();
  expect(calls).toContain(`DELETE /api/streamers/${streamer.id}/follow`);
});

it('puts the button back and says so when following fails', async () => {
  stubApi({ follows: [], failFollow: true });
  renderAt('/broadcasts/b1');
  fireEvent.click(await screen.findByRole('button', { name: '팔로우' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    '팔로우하지 못했습니다.',
  );
  const button = screen.getByRole('button', { name: '팔로우' });
  expect(button.getAttribute('aria-pressed')).toBe('false');
});

it('gives the streamer no follow button on their own broadcast', async () => {
  stubApi({ me: { ...viewer, id: streamer.id, nickname: streamer.nickname } });
  renderAt('/broadcasts/b1');
  expect(
    await screen.findByRole('heading', { name: '불씨의 방송' }),
  ).toBeDefined();
  expect(screen.queryByRole('button', { name: /팔로우|팔로잉/ })).toBeNull();
});

it('asks anonymous viewers to log in instead of showing the button', async () => {
  stubApi({ me: null });
  renderAt('/broadcasts/b1');
  expect(
    await screen.findByRole('link', { name: '로그인하고 팔로우' }),
  ).toBeDefined();
  expect(screen.queryByRole('button', { name: '팔로우' })).toBeNull();
});

it('lists the same follows on /following, linked from the header', async () => {
  stubApi({ follows: [liveStreamer('s1', '라임조아', '새벽 랭크')] });
  renderAt('/');
  fireEvent.click(await screen.findByRole('link', { name: '팔로잉' }));
  const page = await screen.findByRole('heading', {
    level: 1,
    name: '팔로우한 스트리머',
  });
  const section = page.closest('section')!;
  expect(
    within(section)
      .getByRole('link', { name: /라임조아/ })
      .getAttribute('href'),
  ).toBe('/broadcasts/b-s1');
});

it('keeps the 팔로잉 link and /following from anonymous visitors', async () => {
  stubApi({ me: null });
  renderAt('/following');
  expect(await screen.findByLabelText('이메일')).toBeDefined();
  expect(screen.queryByRole('link', { name: '팔로잉' })).toBeNull();
});
