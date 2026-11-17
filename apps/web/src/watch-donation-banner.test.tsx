import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { Broadcast } from './broadcasts';
import type { Donation, DonationSummary } from './donations';
import { advanceClock, eventually, useFakeClock } from './testing/fakeClock';
import {
  KOREAN_VOICE,
  stubSpeech,
  voice,
  type SpeechCall,
} from './testing/speechSynthesis';
import { preloadLazyPages } from './testing/preloadLazyPages';

beforeAll(preloadLazyPages);

// S5(#161): 시청 화면 플레이어 위 새 후원 배너. S14(#186): 그 배너를 소리로 읽기.

beforeEach(() => {
  // 볼륨과 "후원 읽기" 선택이 테스트 사이에 남지 않게 한다.
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  // 배너 6초와 폴링 5초는 테스트가 시계를 넘길 때만 지난다.
  useFakeClock();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const streamer = { id: 'u1', nickname: '불씨', avatarUrl: null };
const viewer = { id: 'u2', email: 'b@example.com', nickname: '구경꾼' };

function broadcast(overrides: Partial<Broadcast> = {}): Broadcast {
  return {
    id: 'b1',
    title: '저녁 방송',
    description: '',
    category: 'ETC',
    game: null,
    status: 'LIVE',
    startedAt: '2026-11-15T00:00:00.000Z',
    endedAt: null,
    disconnectedAt: null,
    createdAt: '2026-11-15T00:00:00.000Z',
    recordingFiles: [],
    recordingParts: [],
    thumbnailUrl: null,
    standbyImageUrl: null,
    streamer,
    ...overrides,
  };
}

function donation(overrides: Partial<Donation> = {}): Donation {
  return {
    id: 'd1',
    method: 'TOSS',
    amount: 5000,
    message: '',
    approvedAt: '2026-11-15T00:10:00.000Z',
    donor: { id: 'u3', nickname: '시청자' },
    ...overrides,
  };
}

// 최신 순(API와 같다)으로 받은 후원을 응답으로 만든다.
const summaryOf = (list: Donation[]): DonationSummary => ({
  total: list.reduce((sum, d) => sum + d.amount, 0),
  count: list.length,
  donations: list,
  ranking: [],
});

const DONATIONS = 'GET /api/broadcasts/b1/donations';

// 각 `METHOD /api/path`에 표의 값으로 답하고, 숫자면 그 상태 코드다. 나머지는
// 404다. 표는 호출마다 읽으므로 바꾸면 다음 응답이 바뀐다.
function renderWatch(
  routes: Record<string, unknown>,
  { strict = false }: { strict?: boolean } = {},
) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(key);
    const answer = key in routes ? routes[key] : 404;
    return Promise.resolve(
      typeof answer === 'number'
        ? new Response(null, { status: answer })
        : Response.json(answer),
    );
  });
  const page = (
    <MemoryRouter initialEntries={['/broadcasts/b1']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );
  render(strict ? <StrictMode>{page}</StrictMode> : page);
  return { routes, calls };
}

// 화면이 첫 후원 응답을 받아 기준선을 잡을 때까지 기다린다. 첫 요청이
// 아직 오는 중이면 다음 주기 요청은 건너뛰므로(usePolledApi), 응답을
// 바꾸기 전에 부른다.
async function donationsLoaded() {
  const panel = await eventually(() =>
    screen.getByRole('region', { name: '후원' }),
  );
  await eventually(() => within(panel).getByText(/^\d+건$/));
}

const nextPoll = () => advanceClock(5000);
const shownFor6Seconds = () => advanceClock(6000);

const EARLIER = donation({ id: 'd0', amount: 1000, message: '먼저 온 후원' });
const CARD = donation({ id: 'd1', message: '화이팅' });
const LIME = donation({
  id: 'd2',
  method: 'LIME',
  amount: 3000,
  approvedAt: '2026-11-15T00:11:00.000Z',
  donor: { id: 'u4', nickname: '라임팬' },
});

it('shows new donations over the live player one at a time for 6 seconds each, but not the ones already there', async () => {
  const page = renderWatch({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summaryOf([EARLIER]),
  });
  const video = await eventually(() => screen.getByLabelText('방송 화면'));
  await donationsLoaded();

  page.routes[DONATIONS] = summaryOf([LIME, CARD, EARLIER]);
  await nextPoll();

  // 오래된 카드 후원이 먼저, 혼자 뜬다.
  const card = await eventually(() =>
    screen.getByText('시청자님이 5,000원 후원'),
  );
  const banners = card.closest('[aria-live="polite"]') as HTMLElement;
  // 전체 화면은 영상을 감싼 플레이어 컨테이너에 걸리므로 배너도 그 안에 있어야 보인다.
  expect(video.parentElement?.contains(banners)).toBe(true);
  expect(within(banners).getByText('화이팅')).toBeDefined();
  expect(within(banners).queryByText('라임팬님이 3,000라임 후원')).toBeNull();
  expect(within(banners).queryByText('먼저 온 후원')).toBeNull();

  // 6초 직전까지는 그대로다.
  await advanceClock(5999);
  expect(within(banners).getByText('시청자님이 5,000원 후원')).toBeDefined();
  await advanceClock(1);
  expect(within(banners).getByText('라임팬님이 3,000라임 후원')).toBeDefined();
  expect(within(banners).queryByText('시청자님이 5,000원 후원')).toBeNull();

  await shownFor6Seconds();
  expect(banners.textContent).toBe('');
});

it('bundles what waits beyond 4 into one 외 N건 후원 banner', async () => {
  const page = renderWatch({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summaryOf([]),
  });
  await eventually(() => screen.getByLabelText('방송 화면'));
  await donationsLoaded();

  // 한 응답에 새 후원 7건(최신 순).
  const wave = Array.from({ length: 7 }, (_, i) =>
    donation({
      id: `w${i}`,
      approvedAt: `2026-11-15T00:2${i}:00.000Z`,
      donor: { id: `u${i + 10}`, nickname: `팬${i}` },
    }),
  ).reverse();
  page.routes[DONATIONS] = summaryOf(wave);
  await nextPoll();

  // 지금 1장과 기다리는 4장은 따로, 남은 2건은 한 장이다.
  await eventually(() => screen.getByText('팬0님이 5,000원 후원'));
  for (let i = 1; i < 5; i += 1) {
    await shownFor6Seconds();
    expect(screen.getByText(`팬${i}님이 5,000원 후원`)).toBeDefined();
  }
  await shownFor6Seconds();
  expect(screen.getByText('외 2건 후원')).toBeDefined();
  expect(screen.queryByText('팬5님이 5,000원 후원')).toBeNull();
});

it('shows no banner before the broadcast is LIVE or once it ended', async () => {
  for (const status of ['READY', 'ENDED'] as const) {
    const page = renderWatch({
      'GET /api/auth/me': 401,
      'GET /api/broadcasts/b1': broadcast({ status }),
      [DONATIONS]: summaryOf([EARLIER]),
    });
    await donationsLoaded();

    page.routes[DONATIONS] = summaryOf([CARD, EARLIER]);
    await nextPoll();
    // 패널은 새 후원을 합계·건수에 반영하지만 배너는 없다. 개별 후원은
    // 패널이 아니라 채팅의 후원 줄에 있다(#166).
    const panel = screen.getByRole('region', { name: '후원' });
    await eventually(() => within(panel).getByText('2건'));
    expect(screen.queryByText('시청자님이 5,000원 후원')).toBeNull();
    cleanup();
  }
});

it('reads the donations once per poll for both the panel and the banner', async () => {
  const page = renderWatch({
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summaryOf([]),
  });
  await eventually(() => screen.getByLabelText('방송 화면'));
  await donationsLoaded();
  const reads = () => page.calls.filter((call) => call === DONATIONS).length;
  expect(reads()).toBe(1);

  page.routes[DONATIONS] = summaryOf([CARD]);
  await nextPoll();
  await eventually(() => screen.getByText('시청자님이 5,000원 후원'));
  expect(reads()).toBe(2);
  await nextPoll();
  expect(reads()).toBe(3);
});

it('shows the donor their own donation too, next to the existing notice', async () => {
  const page = renderWatch({
    'GET /api/auth/me': viewer,
    'GET /api/me/lime': { balance: 0 },
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summaryOf([]),
  });
  await donationsLoaded();
  const panel = screen.getByRole('region', { name: '후원' });

  page.routes[DONATIONS] = summaryOf([
    donation({ donor: { id: viewer.id, nickname: viewer.nickname } }),
  ]);
  // 결제 탭이 알린다. 5초 폴링을 기다리지 않고 바로 다시 읽는다.
  const tab = new BroadcastChannel('donations');
  tab.postMessage({ type: 'donated', broadcastId: 'b1' });
  tab.close();

  await eventually(() => screen.getByText('구경꾼님이 5,000원 후원'));
  expect(within(panel).getByRole('status').textContent).toBe(
    '후원이 반영되었습니다',
  );
});

// S14(#186): 후원 읽어 주기.

const speakToggle = () => screen.queryByRole('button', { name: '후원 읽기' });

// jsdom 영상은 재생하지 않으므로 재생 중인 것처럼 만든다.
async function playingVideo(): Promise<HTMLVideoElement> {
  const video = await eventually(() =>
    screen.getByLabelText<HTMLVideoElement>('방송 화면'),
  );
  Object.defineProperty(video, 'paused', { value: false, configurable: true });
  fireEvent.play(video);
  return video;
}

// 마지막 cancel 뒤에 보낸 문장. cancel은 밀린 음성까지 모두 멈춘다.
function stillSpeaking(calls: SpeechCall[]): string[] {
  const since = calls.findLastIndex((call) => call.type === 'cancel');
  return calls
    .slice(since + 1)
    .flatMap((call) =>
      call.type === 'speak' && call.utterance.text.trim()
        ? [call.utterance.text]
        : [],
    );
}

function liveWith(list: Donation[]) {
  return {
    'GET /api/auth/me': 401,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summaryOf(list),
  };
}

it('reads a new donation once in a Korean voice at the player volume, without its message or the ones already there', async () => {
  const speech = stubSpeech({
    voices: [voice('en-US', 'Samantha', true), KOREAN_VOICE],
  });
  const page = renderWatch(liveWith([EARLIER]));
  const video = await playingVideo();
  act(() => {
    video.volume = 0.4;
  });
  await donationsLoaded();
  expect(speech.heard()).toEqual([]);

  page.routes[DONATIONS] = summaryOf([CARD, EARLIER]);
  await nextPoll();
  await eventually(() => screen.getByText('시청자님이 5,000원 후원'));
  expect(speech.heard()).toEqual([
    {
      text: '시청자님이 5000원 후원했습니다',
      voice: KOREAN_VOICE,
      lang: 'ko-KR',
      volume: 0.4,
    },
  ]);
});

it('stays quiet while the player is muted or at volume zero, and the banner still shows', async () => {
  const speech = stubSpeech({ voices: [KOREAN_VOICE] });
  const page = renderWatch(liveWith([]));
  const video = await playingVideo();
  await donationsLoaded();

  act(() => {
    video.muted = true;
  });
  page.routes[DONATIONS] = summaryOf([LIME, CARD]);
  await nextPoll();
  await eventually(() => screen.getByText('시청자님이 5,000원 후원'));

  act(() => {
    video.muted = false;
    video.volume = 0;
  });
  await shownFor6Seconds();
  expect(screen.getByText('라임팬님이 3,000라임 후원')).toBeDefined();
  expect(speech.heard()).toEqual([]);
});

it('reads the cards in the order of the banner queue, cutting off the previous one, and a bundle as 외 N건 후원', async () => {
  const speech = stubSpeech({ voices: [KOREAN_VOICE] });
  const page = renderWatch(liveWith([]));
  await playingVideo();
  await donationsLoaded();

  const wave = Array.from({ length: 6 }, (_, i) =>
    donation({
      id: `w${i}`,
      method: i === 1 ? 'LIME' : 'TOSS',
      amount: 1000 * (i + 1),
      approvedAt: `2026-11-15T00:2${i}:00.000Z`,
      donor: { id: `u${i + 10}`, nickname: `팬${i}` },
    }),
  ).reverse();
  page.routes[DONATIONS] = summaryOf(wave);
  await nextPoll();
  await eventually(() => screen.getByText('팬0님이 1,000원 후원'));
  expect(stillSpeaking(speech.calls)).toEqual(['팬0님이 1000원 후원했습니다']);

  for (let i = 0; i < 5; i += 1) await shownFor6Seconds();
  expect(speech.heard().map((u) => u.text)).toEqual([
    '팬0님이 1000원 후원했습니다',
    '팬1님이 2000라임 후원했습니다',
    '팬2님이 3000원 후원했습니다',
    '팬3님이 4000원 후원했습니다',
    '팬4님이 5000원 후원했습니다',
    '외 1건 후원',
  ]);
  // 장마다 앞 음성을 끊고 읽어 밀리지 않는다.
  speech.calls.forEach((call, i) => {
    if (call.type === 'speak' && call.utterance.text.trim()) {
      expect(speech.calls[i - 1]).toEqual({ type: 'cancel' });
    }
  });
});

it('stops reading once the viewer mutes', async () => {
  const speech = stubSpeech({ voices: [KOREAN_VOICE] });
  const page = renderWatch(liveWith([]));
  const video = await playingVideo();
  await donationsLoaded();
  page.routes[DONATIONS] = summaryOf([CARD]);
  await nextPoll();
  await eventually(() => expect(speech.heard()).toHaveLength(1));

  const before = speech.calls.length;
  act(() => {
    video.muted = true;
  });
  // jsdom은 volumechange를 다음 차례에 보낸다.
  await eventually(() =>
    expect(speech.calls.slice(before)).toEqual([{ type: 'cancel' }]),
  );
});

it('turns reading off and on from 후원 읽기 in the player controls, remembering the choice', async () => {
  const speech = stubSpeech({ voices: [KOREAN_VOICE] });
  const page = renderWatch(liveWith([]));
  const video = await playingVideo();
  await donationsLoaded();
  const toggle = await eventually(() => speakToggle()!);
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  // 전체 화면은 영상을 감싼 플레이어 컨테이너에 걸리므로 버튼도 그 안에 있어야 쓸 수 있다.
  expect(video.parentElement?.contains(toggle)).toBe(true);

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  page.routes[DONATIONS] = summaryOf([CARD]);
  await nextPoll();
  await eventually(() => screen.getByText('시청자님이 5,000원 후원'));
  expect(speech.heard()).toEqual([]);
  cleanup();

  const again = renderWatch(liveWith([]));
  await playingVideo();
  await donationsLoaded();
  const remembered = await eventually(() => speakToggle()!);
  expect(remembered.getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(remembered);
  expect(remembered.getAttribute('aria-pressed')).toBe('true');
  again.routes[DONATIONS] = summaryOf([LIME]);
  await nextPoll();
  await eventually(() => screen.getByText('라임팬님이 3,000라임 후원'));
  expect(speech.heard().map((u) => u.text)).toEqual([
    '라임팬님이 3000라임 후원했습니다',
  ]);
});

it('offers no 후원 읽기 and reads nothing where the browser cannot speak, but still shows the banner', async () => {
  const page = renderWatch(liveWith([]));
  await playingVideo();
  await donationsLoaded();
  page.routes[DONATIONS] = summaryOf([CARD]);
  await nextPoll();
  await eventually(() => screen.getByText('시청자님이 5,000원 후원'));
  expect(speakToggle()).toBeNull();
});

it('offers 후원 읽기 only once a Korean voice is there', async () => {
  const speech = stubSpeech({ voices: [] });
  renderWatch(liveWith([]));
  await playingVideo();
  await donationsLoaded();
  expect(speakToggle()).toBeNull();

  act(() => speech.setVoices([voice('en-US', 'Samantha')]));
  expect(speakToggle()).toBeNull();

  act(() => speech.setVoices([voice('en-US', 'Samantha'), KOREAN_VOICE]));
  expect(speakToggle()).not.toBeNull();
});

it('reads a card once under StrictMode', async () => {
  const speech = stubSpeech({ voices: [KOREAN_VOICE] });
  const page = renderWatch(liveWith([]), { strict: true });
  await playingVideo();
  await donationsLoaded();
  page.routes[DONATIONS] = summaryOf([CARD]);
  await nextPoll();
  await eventually(() => screen.getByText('시청자님이 5,000원 후원'));
  expect(stillSpeaking(speech.calls)).toEqual([
    '시청자님이 5000원 후원했습니다',
  ]);
});

it('opens speech with one silent utterance on the first tap or click, as iPhone Safari needs', async () => {
  const speech = stubSpeech({ voices: [KOREAN_VOICE] });
  renderWatch(liveWith([]));
  const video = await playingVideo();
  await eventually(() => speakToggle()!);

  fireEvent.click(video);
  fireEvent.click(video);
  expect(speech.calls).toEqual([
    {
      type: 'speak',
      utterance: { text: ' ', voice: null, lang: '', volume: 0 },
    },
  ]);
});
