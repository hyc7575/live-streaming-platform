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
import type { ReceivedDonationSummary, SentDonationSummary } from './donations';
import type { FollowerList } from './follows/follows';
import type { LimeLedgerEntry } from './lime';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const me = {
  id: 'u1',
  email: 'b@example.com',
  nickname: '구경꾼',
  standbyImageUrl: null,
};

const LEDGER: LimeLedgerEntry[] = [
  {
    id: 'l3',
    kind: 'DONATION',
    delta: -2000,
    balanceAfter: 5000,
    createdAt: '2026-11-13T05:00:00.000Z',
    donation: { broadcast: null, recipient: null },
  },
  {
    id: 'l2',
    kind: 'DONATION',
    delta: -3000,
    balanceAfter: 7000,
    createdAt: '2026-11-13T04:00:00.000Z',
    donation: {
      broadcast: { id: 'b1', title: '저녁 방송' },
      recipient: { id: 's1', nickname: '불씨' },
    },
  },
  {
    id: 'l1',
    kind: 'CHARGE',
    delta: 10000,
    balanceAfter: 10000,
    createdAt: '2026-11-13T03:00:00.000Z',
    donation: null,
  },
];

const SENT: SentDonationSummary = {
  total: 4000,
  count: 2,
  donations: [
    {
      id: 'd2',
      method: 'TOSS',
      amount: 1000,
      message: '잘 보고 있어요',
      approvedAt: '2026-11-13T05:00:00.000Z',
      broadcast: null,
      recipient: null,
    },
    {
      id: 'd1',
      method: 'LIME',
      amount: 3000,
      message: '',
      approvedAt: '2026-11-13T04:00:00.000Z',
      broadcast: { id: 'b1', title: '저녁 방송' },
      recipient: { id: 's1', nickname: '불씨' },
    },
  ],
};

const RECEIVED: ReceivedDonationSummary = {
  total: 6000,
  count: 2,
  donations: [
    {
      id: 'r2',
      method: 'LIME',
      amount: 3000,
      message: '응원해요',
      approvedAt: '2026-11-13T05:00:00.000Z',
      donor: { id: 'u1', nickname: '구경꾼' },
      broadcast: null,
    },
    {
      id: 'r1',
      method: 'TOSS',
      amount: 3000,
      message: '',
      approvedAt: '2026-11-13T04:00:00.000Z',
      donor: { id: 'f2', nickname: '다른사람' },
      broadcast: { id: 'b1', title: '저녁 방송' },
    },
  ],
};

const FOLLOWERS: FollowerList = {
  count: 2,
  followers: [
    { id: 'f2', nickname: '다른사람', followedAt: '2026-11-13T05:00:00.000Z' },
    { id: 'f1', nickname: '구경꾼', followedAt: '2026-11-12T05:00:00.000Z' },
  ],
};

// Answers each `METHOD /api/path` from the table; anything else is a 404.
// `me: 401` makes the visitor anonymous.
function stubApi(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
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

const loggedIn = {
  'GET /api/auth/me': me,
  'GET /api/me/follows': [],
  'GET /api/broadcasts': [],
  'GET /api/me/lime': { balance: 5000 },
  'GET /api/me/lime/ledger': LEDGER,
  'GET /api/me/donations': SENT,
  'GET /api/me/received-donations': RECEIVED,
  'GET /api/me/followers': FOLLOWERS,
  'POST /api/auth/logout': 204,
};

it('opens the nickname menu, closes it on Escape, and goes to the my page', async () => {
  stubApi(loggedIn);
  renderAt('/');
  const button = await screen.findByRole('button', {
    name: '구경꾼',
    expanded: false,
  });
  expect(screen.queryByRole('link', { name: '마이페이지' })).toBeNull();

  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('button', { name: '로그아웃' })).toBeDefined();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(button);

  fireEvent.click(button);
  fireEvent.click(screen.getByRole('link', { name: '마이페이지' }));
  expect(
    await screen.findByRole('heading', { name: '라임 내역' }),
  ).toBeDefined();
  expect(button.getAttribute('aria-expanded')).toBe('false');
});

it('logs out from the nickname menu', async () => {
  stubApi(loggedIn);
  renderAt('/me');
  fireEvent.click(
    await screen.findByRole('button', { name: '구경꾼', expanded: false }),
  );
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  expect(await screen.findByRole('link', { name: '로그인' })).toBeDefined();
});

it('sends a logged-out visitor from the my page to the login page', async () => {
  stubApi({ 'GET /api/auth/me': 401, 'GET /api/broadcasts': [] });
  renderAt('/me');
  expect(await screen.findByRole('heading', { name: '로그인' })).toBeDefined();
});

it('shows the balance above the ledger, newest first', async () => {
  stubApi(loggedIn);
  const open = vi.fn();
  vi.stubGlobal('open', open);
  renderAt('/me');
  expect(await screen.findByText('5,000라임')).toBeDefined();
  const tabs = screen.getByRole('navigation', { name: '마이페이지' });
  expect(
    within(tabs).getByRole('link', { name: '라임 내역' }).ariaCurrent,
  ).toBe('page');

  const rows = within(
    within(screen.getByRole('main')).getByRole('list'),
  ).getAllByRole('listitem');
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringMatching(/^후원삭제된 방송.*−2,000라임잔액 5,000라임$/),
    expect.stringMatching(
      /^후원불씨에게 · 저녁 방송.*−3,000라임잔액 7,000라임$/,
    ),
    expect.stringMatching(/^충전.*\+10,000라임잔액 10,000라임$/),
  ]);
  expect(
    within(rows[1])
      .getByRole('link', { name: '저녁 방송' })
      .getAttribute('href'),
  ).toBe('/broadcasts/b1');

  fireEvent.click(screen.getByRole('button', { name: '충전하기' }));
  expect(open).toHaveBeenCalledWith('/lime/charge', '_blank');
});

it('lists sent donations in their own units under a total in won', async () => {
  stubApi(loggedIn);
  renderAt('/me/donations');
  expect(
    await screen.findByRole('heading', { name: '보낸 후원' }),
  ).toBeDefined();
  expect(await screen.findByText('4,000원')).toBeDefined();
  expect(screen.getByText('2건')).toBeDefined();
  const rows = within(
    within(screen.getByRole('main')).getByRole('list'),
  ).getAllByRole('listitem');
  expect(rows[0].textContent).toMatch(/^삭제된 방송잘 보고 있어요.*1,000원$/);
  expect(rows[1].textContent).toMatch(/^불씨에게 · 저녁 방송.*3,000라임$/);
});

it('says so when nothing was sent', async () => {
  stubApi({
    ...loggedIn,
    'GET /api/me/donations': { total: 0, count: 0, donations: [] },
  });
  renderAt('/me/donations');
  expect(await screen.findByText('아직 보낸 후원이 없습니다.')).toBeDefined();
});

it('shows the streamer’s followers with the studio menu', async () => {
  stubApi(loggedIn);
  renderAt('/studio/followers');
  expect(await screen.findByText('2명')).toBeDefined();
  const tabs = screen.getByRole('navigation', { name: '스튜디오' });
  expect(within(tabs).getByRole('link', { name: '팔로워' }).ariaCurrent).toBe(
    'page',
  );
  const rows = within(
    within(screen.getByRole('main')).getByRole('list'),
  ).getAllByRole('listitem');
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringMatching(/^다다른사람.*팔로우$/),
    expect.stringMatching(/^구구경꾼.*팔로우$/),
  ]);
});

it.each([
  ['/studio', '스튜디오', ['내 방송', '내 채널', '후원', '팔로워']],
  ['/me/donations', '마이페이지', ['라임 내역', '보낸 후원']],
])(
  'shows the area menu instead of the follow panel on %s',
  async (path, area, labels) => {
    stubApi({ ...loggedIn, 'GET /api/me/broadcasts': [] });
    renderAt(path);
    const nav = await screen.findByRole('navigation', { name: area });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(labels);
    expect(
      within(nav).getByRole('link', { current: 'page' }).getAttribute('href'),
    ).toBe(path);
    expect(screen.queryByText('팔로우한 스트리머')).toBeNull();
  },
);

it('keeps the follow panel on watching pages', async () => {
  stubApi(loggedIn);
  renderAt('/');
  expect(await screen.findByText('팔로우한 스트리머')).toBeDefined();
  expect(screen.queryByRole('navigation', { name: '스튜디오' })).toBeNull();
});

it('keeps the menu open when a click blurs it without moving focus, as Safari does', async () => {
  stubApi(loggedIn);
  renderAt('/');
  const button = await screen.findByRole('button', {
    name: '구경꾼',
    expanded: false,
  });
  fireEvent.click(button);
  fireEvent.blur(button, { relatedTarget: null });
  expect(button.getAttribute('aria-expanded')).toBe('true');
  fireEvent.blur(button, { relatedTarget: document.body });
  expect(button.getAttribute('aria-expanded')).toBe('false');
});

it('totals what the streamer received, keeping donations of deleted broadcasts', async () => {
  stubApi(loggedIn);
  renderAt('/studio/donations');
  expect(
    await screen.findByRole('heading', { name: '받은 후원' }),
  ).toBeDefined();
  expect(await screen.findByText('6,000원')).toBeDefined();
  expect(screen.getByText('2건')).toBeDefined();
  const rows = within(
    within(screen.getByRole('main')).getByRole('list'),
  ).getAllByRole('listitem');
  expect(rows[0]?.textContent).toMatch(
    /^구경꾼삭제된 방송응원해요.*3,000라임$/,
  );
  expect(rows[1]?.textContent).toMatch(/^다른사람저녁 방송.*3,000원$/);
  const tabs = screen.getByRole('navigation', { name: '스튜디오' });
  expect(within(tabs).getByRole('link', { name: '후원' }).ariaCurrent).toBe(
    'page',
  );
});
