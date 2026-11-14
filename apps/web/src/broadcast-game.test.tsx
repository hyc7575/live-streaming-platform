import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { Broadcast } from './broadcasts';
import { renderInDataRouter } from './testing/renderInDataRouter';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const streamer = { id: 'u1', email: 'a@example.com', nickname: '불씨' };
const LOL = { qid: 'Q223341', name: '리그 오브 레전드' };

function broadcast(overrides: Partial<Broadcast>): Broadcast {
  return {
    id: 'b1',
    title: '방송',
    description: '',
    category: 'ETC',
    game: null,
    status: 'LIVE',
    startedAt: null,
    endedAt: null,
    disconnectedAt: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    recordingFiles: [],
    recordingParts: [],
    thumbnailUrl: null,
    standbyImageUrl: null,
    streamer: { id: streamer.id, nickname: streamer.nickname },
    ...overrides,
  };
}

// 각 `METHOD /api/path`에 표의 값으로 답하고, 나머지는 404다.
// 함수 값은 Response 전체를 만든다. `bodies`는 보낸 요청 본문을 키별로 모은다.
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
    return typeof body === 'function'
      ? (body as () => Promise<Response>)()
      : Promise.resolve(
          typeof body === 'number'
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

it('badges a game card with the game title, keeping the full name as its tooltip', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts': [
      broadcast({ id: 'b1', title: '랭크', category: 'GAME', game: LOL }),
      broadcast({ id: 'b2', title: '게임만', category: 'GAME' }),
    ],
  });
  renderAt('/');
  const lol = await screen.findByRole('link', { name: /랭크/ });
  const badge = within(lol).getByText('게임 · 리그 오브 레전드');
  expect(badge.getAttribute('title')).toBe('게임 · 리그 오브 레전드');
  const plain = screen.getByRole('link', { name: /게임만/ });
  expect(within(plain).getByText('게임')).toBeDefined();
});

it('badges the watch page title with the game title', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast({
      title: '랭크',
      category: 'GAME',
      game: { qid: null, name: '카트라이더 슈퍼러쉬' },
    }),
  });
  renderAt('/broadcasts/b1');
  const title = await screen.findByRole('heading', { name: '랭크' });
  expect(title.nextElementSibling?.textContent).toBe(
    '게임 · 카트라이더 슈퍼러쉬',
  );
});

const gamesPath = (q: string) => `GET /api/games?q=${encodeURIComponent(q)}`;
const LOL_HIT = {
  qid: 'Q223341',
  name: '리그 오브 레전드',
  nameEn: 'League of Legends',
};
const TFT_HIT = { qid: 'Q65085592', name: '전략적 팀 전투', nameEn: null };

// 만들기 폼을 열고 카테고리 "게임"을 고른다. 만들면 송출 화면으로 가므로 data router에 그린다.
async function openCreateFormWithGame(routes: Record<string, unknown>) {
  const created = broadcast({ id: 'b9', title: '새 방송', status: 'READY' });
  const calls = stubApi({
    'GET /api/auth/me': streamer,
    'POST /api/broadcasts': created,
    'GET /api/broadcasts/b9': created,
    ...routes,
  });
  renderInDataRouter(
    ['/studio/new'],
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>,
  );
  fireEvent.change(await screen.findByLabelText('제목'), {
    target: { value: '새 방송' },
  });
  expect(screen.queryByRole('combobox')).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: '게임' }));
  return calls;
}

const gameBox = () =>
  screen.getByRole<HTMLInputElement>('combobox', { name: '게임 (선택)' });

const optionTexts = () =>
  screen.getAllByRole('option').map((o) => o.textContent);

async function submitCreate(calls: ReturnType<typeof stubApi>) {
  fireEvent.click(screen.getByRole('button', { name: '만들기' }));
  await screen.findByRole('heading', { name: '새 방송' });
  return calls.bodies['POST /api/broadcasts'];
}

it('searches games 300 ms after typing and picks one with the arrow and Enter keys', async () => {
  const calls = await openCreateFormWithGame({
    [gamesPath('롤')]: [LOL_HIT, TFT_HIT],
  });
  const box = gameBox();
  expect(box.maxLength).toBe(50);
  fireEvent.change(box, { target: { value: '롤' } });
  // 디바운스 전에는 부르지 않는다.
  expect(calls).not.toContain(gamesPath('롤'));

  await screen.findByRole('option', { name: /^리그 오브 레전드/ });
  expect(optionTexts()).toEqual([
    '리그 오브 레전드League of Legends',
    '전략적 팀 전투',
    "'롤' 직접 입력",
  ]);
  expect(box.getAttribute('aria-expanded')).toBe('true');
  const listbox = screen.getByRole('listbox');
  expect(box.getAttribute('aria-controls')).toBe(listbox.id);

  fireEvent.keyDown(box, { key: 'ArrowDown' });
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  fireEvent.keyDown(box, { key: 'ArrowUp' });
  const first = screen.getAllByRole('option')[0];
  expect(box.getAttribute('aria-activedescendant')).toBe(first.id);
  expect(first.getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(box, { key: 'Enter' });

  expect(box.value).toBe('리그 오브 레전드');
  expect(box.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(calls.filter((c) => c.startsWith('GET /api/games'))).toEqual([
    gamesPath('롤'),
  ]);

  expect(await submitCreate(calls)).toMatchObject({
    category: 'GAME',
    gameQid: 'Q223341',
    gameName: null,
  });
});

it('leaves only the typed entry when the game search fails, and saves it as typed', async () => {
  const calls = await openCreateFormWithGame({
    [gamesPath('카트라이더 슈퍼러쉬')]: 500,
  });
  fireEvent.change(gameBox(), { target: { value: ' 카트라이더 슈퍼러쉬 ' } });
  await waitFor(() =>
    expect(calls).toContain(gamesPath('카트라이더 슈퍼러쉬')),
  );
  await waitFor(() => expect(optionTexts()).toHaveLength(1));
  expect(optionTexts()).toEqual(["'카트라이더 슈퍼러쉬' 직접 입력"]);

  fireEvent.click(screen.getByRole('option'));
  expect(gameBox().value).toBe('카트라이더 슈퍼러쉬');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(await submitCreate(calls)).toMatchObject({
    category: 'GAME',
    gameQid: null,
    gameName: '카트라이더 슈퍼러쉬',
  });
});

it('does not search blank input and saves a 게임 broadcast with no game', async () => {
  const calls = await openCreateFormWithGame({});
  fireEvent.change(gameBox(), { target: { value: '   ' } });
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(calls.some((c) => c.startsWith('GET /api/games'))).toBe(false);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(await submitCreate(calls)).toMatchObject({
    category: 'GAME',
    gameQid: null,
    gameName: null,
  });
});

it('closes the list on Escape and ignores the Enter that ends Korean composition', async () => {
  const calls = await openCreateFormWithGame({
    [gamesPath('리그')]: [LOL_HIT],
  });
  const box = gameBox();
  fireEvent.change(box, { target: { value: '리그' } });
  await screen.findByRole('option', { name: /^리그 오브 레전드/ });
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
  expect(box.value).toBe('리그');
  expect(box.getAttribute('aria-expanded')).toBe('true');

  fireEvent.keyDown(box, { key: 'Escape' });
  expect(box.getAttribute('aria-expanded')).toBe('false');
  expect(box.hasAttribute('aria-activedescendant')).toBe(false);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(calls).not.toContain('POST /api/broadcasts');

  // 닫힌 뒤 ↓는 같은 후보를 다시 연다.
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  expect(optionTexts()).toEqual([
    '리그 오브 레전드League of Legends',
    "'리그' 직접 입력",
  ]);
});

it('ignores a search answer that arrives after a newer one', async () => {
  const answers: Record<string, (hits: unknown) => void> = {};
  const pending = (q: string) => () =>
    new Promise<Response>((resolve) => {
      answers[q] = (hits) => resolve(Response.json(hits));
    });
  await openCreateFormWithGame({
    [gamesPath('리')]: pending('리'),
    [gamesPath('리그')]: pending('리그'),
  });
  fireEvent.change(gameBox(), { target: { value: '리' } });
  await waitFor(() => expect(answers['리']).toBeDefined());
  fireEvent.change(gameBox(), { target: { value: '리그' } });
  await waitFor(() => expect(answers['리그']).toBeDefined());

  answers['리그']([LOL_HIT]);
  await screen.findByRole('option', { name: /^리그 오브 레전드/ });
  answers['리']([TFT_HIT]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(optionTexts()).toEqual([
    '리그 오브 레전드League of Legends',
    "'리그' 직접 입력",
  ]);
});

it('starts the edit form from the current game and drops it when the category changes', async () => {
  const calls = stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast({
      title: '랭크',
      category: 'GAME',
      game: LOL,
    }),
    'PATCH /api/broadcasts/b1': broadcast({ title: '랭크' }),
  });
  renderAt('/studio/broadcasts/b1/edit');
  await screen.findByLabelText('제목');
  expect(gameBox().value).toBe('리그 오브 레전드');

  fireEvent.click(screen.getByRole('radio', { name: '음악' }));
  expect(screen.queryByRole('combobox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByRole('heading', { name: '랭크' });
  expect(calls.bodies['PATCH /api/broadcasts/b1']).toEqual({
    title: '랭크',
    description: '',
    category: 'MUSIC',
  });
});

it('keeps the picked game when the edit form is saved unchanged', async () => {
  const calls = stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast({
      title: '랭크',
      category: 'GAME',
      game: LOL,
    }),
    'PATCH /api/broadcasts/b1': broadcast({ title: '랭크' }),
  });
  renderAt('/studio/broadcasts/b1/edit');
  await screen.findByLabelText('제목');
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByRole('heading', { name: '랭크' });
  expect(calls.bodies['PATCH /api/broadcasts/b1']).toMatchObject({
    category: 'GAME',
    gameQid: 'Q223341',
    gameName: null,
  });
});

it('finds a broadcast on the home search by its game title', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts': [
      broadcast({
        id: 'b1',
        title: '오늘도 랭크',
        category: 'GAME',
        game: LOL,
      }),
      broadcast({ id: 'b2', title: '저녁 라디오', category: 'TALK' }),
    ],
  });
  renderAt('/');
  await screen.findByText('저녁 라디오');
  const search = screen.getByRole('searchbox', { name: '방송 검색' });
  expect(search.getAttribute('placeholder')).toBe(
    '제목, 스트리머, 게임으로 검색',
  );
  fireEvent.change(search, { target: { value: '리그' } });
  expect(screen.getByRole('link', { name: /오늘도 랭크/ })).toBeDefined();
  expect(screen.queryByText('저녁 라디오')).toBeNull();
});

it('drops the previous candidates as soon as the search text changes', async () => {
  const calls = await openCreateFormWithGame({
    [gamesPath('롤')]: [LOL_HIT],
    // 새 검색어의 응답은 오지 않는다.
    [gamesPath('배그')]: () => new Promise<Response>(() => {}),
  });
  const box = gameBox();
  fireEvent.change(box, { target: { value: '롤' } });
  await screen.findByRole('option', { name: /^리그 오브 레전드/ });
  fireEvent.keyDown(box, { key: 'ArrowDown' });

  fireEvent.change(box, { target: { value: '배그' } });
  expect(optionTexts()).toEqual(["'배그' 직접 입력"]);
  expect(box.hasAttribute('aria-activedescendant')).toBe(false);
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  expect(box.getAttribute('aria-activedescendant')).toBe(
    screen.getByRole('option').id,
  );
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(box.value).toBe('배그');
  expect(await submitCreate(calls)).toMatchObject({
    category: 'GAME',
    gameQid: null,
    gameName: '배그',
  });
});

it('puts no tooltip on a non-game badge even if a game came along', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts': [
      broadcast({ id: 'b1', title: '수다', category: 'TALK', game: LOL }),
    ],
  });
  renderAt('/');
  const card = await screen.findByRole('link', { name: /수다/ });
  expect(within(card).getByText('소통').hasAttribute('title')).toBe(false);
});
