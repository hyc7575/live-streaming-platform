import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { Broadcast } from './broadcasts';
import type {
  ConfirmedDonation,
  Donation,
  DonationOrder,
  DonationSummary,
} from './donations';

const toss = vi.hoisted(() => {
  const widgets = {
    setAmount: vi.fn(() => Promise.resolve()),
    renderPaymentMethods: vi.fn(() =>
      Promise.resolve({ destroy: () => Promise.resolve() }),
    ),
    renderAgreement: vi.fn(() =>
      Promise.resolve({ destroy: () => Promise.resolve() }),
    ),
    requestPayment: vi.fn((): Promise<void> => Promise.resolve()),
  };
  return {
    widgets,
    widgetsFactory: vi.fn(() => widgets),
    loadTossPayments: vi.fn(),
  };
});

vi.mock('@tosspayments/tosspayments-sdk', () => ({
  loadTossPayments: toss.loadTossPayments,
}));

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  toss.loadTossPayments.mockResolvedValue({ widgets: toss.widgetsFactory });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  sessionStorage.clear();
});

const streamer = { id: 'u1', email: 'a@example.com', nickname: '불씨' };
const viewer = { id: 'u2', email: 'b@example.com', nickname: '구경꾼' };

function broadcast(overrides: Partial<Broadcast> = {}): Broadcast {
  return {
    id: 'b1',
    title: '저녁 방송',
    description: '',
    category: 'ETC',
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

function donation(overrides: Partial<Donation> = {}): Donation {
  return {
    id: 'd1',
    method: 'TOSS',
    amount: 5000,
    message: '',
    approvedAt: '2026-11-10T01:00:00.000Z',
    donor: { id: viewer.id, nickname: viewer.nickname },
    ...overrides,
  };
}

const ORDER: DonationOrder = {
  orderId: 'don_0123456789abcdef0123456789abcdef',
  orderName: '저녁 방송 후원',
  amount: 5000,
  clientKey: 'test_gck_docs_fake',
  customerKey: viewer.id,
};

// JSON 본문이 있는 2xx가 아닌 응답이다.
class Reply {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

// 각 `METHOD /api/path`에 표의 값으로 답하고, 나머지는 404다.
// 항목은 요청을 받는 함수일 수 있다. 호출을 실패시키거나 붙잡을 때 쓴다.
// `bodies`는 호출마다 보낸 값을 같은 키로 모아 둔다.
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
    const answer = routes[key];
    if (typeof answer === 'function') {
      return (answer as (init?: RequestInit) => Promise<Response>)(init);
    }
    if (typeof answer === 'number') {
      return Promise.resolve(new Response(null, { status: answer }));
    }
    if (answer instanceof Reply) {
      return Promise.resolve(
        Response.json(answer.body, { status: answer.status }),
      );
    }
    return Promise.resolve(Response.json(answer));
  });
  return Object.assign(calls, { bodies });
}

function renderAt(path: string, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const DONATIONS = 'GET /api/broadcasts/b1/donations';
const summary = (s: Partial<DonationSummary> = {}): DonationSummary => ({
  total: 0,
  count: 0,
  donations: [],
  ...s,
});

async function donationPanel() {
  return screen.findByRole('region', { name: '후원' });
}

it('shows the total, the count and the latest donations on the watch page', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary({
      total: 15000,
      count: 3,
      donations: [
        donation({ id: 'd2', amount: 10000, message: '화이팅' }),
        donation({ id: 'd1', amount: 5000 }),
      ],
    }),
  });
  renderAt('/broadcasts/b1');
  const panel = await donationPanel();
  expect(await within(panel).findByText('15,000원')).toBeDefined();
  expect(within(panel).getByText('3건')).toBeDefined();
  const items = within(panel).getAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByText('10,000원')).toBeDefined();
  expect(within(items[0]).getByText('화이팅')).toBeDefined();
  expect(within(items[0]).getByText(viewer.nickname)).toBeDefined();
});

it('opens 후원하기 in a new tab the payment can close again', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
  });
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  renderAt('/broadcasts/b1');
  const panel = await donationPanel();
  fireEvent.click(
    await within(panel).findByRole('button', { name: '후원하기' }),
  );
  // `noopener`가 없어야 결제 탭이 window.close()로 스스로 닫을 수 있다.
  expect(open).toHaveBeenCalledWith('/broadcasts/b1/donate', '_blank');
  expect(
    await screen.findByRole('heading', { level: 1, name: '저녁 방송' }),
  ).toBeDefined();
});

it('re-reads the donations as soon as the payment tab reports one', async () => {
  // stubApi는 호출마다 표를 읽으므로, 표를 바꾸면 응답도 바뀐다.
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
  };
  stubApi(routes);
  renderAt('/broadcasts/b1');
  const panel = await donationPanel();
  await within(panel).findByText('아직 후원이 없습니다.');
  expect(within(panel).getByRole('status').textContent).toBe('');

  routes[DONATIONS] = summary({
    total: 5000,
    count: 1,
    donations: [donation()],
  });
  const other = new BroadcastChannel('donations');
  // 다른 방송의 후원은 여기서 아무것도 바꾸지 않는다.
  other.postMessage({ type: 'donated', broadcastId: 'b2' });
  other.postMessage({ type: 'donated', broadcastId: 'b1' });
  other.close();
  // 5 s 폴링보다 한참 이르므로, 메시지 말고는 원인이 될 수 없다.
  expect(
    await within(panel).findByText('5,000원', { selector: 'strong' }),
  ).toBeDefined();
  expect(within(panel).getByText('1건')).toBeDefined();
  expect(within(panel).getByRole('status').textContent).toBe(
    '후원이 반영되었습니다',
  );
});

it('says when there are no donations yet', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
  });
  renderAt('/broadcasts/b1');
  const panel = await donationPanel();
  expect(await within(panel).findByText('아직 후원이 없습니다.')).toBeDefined();
  expect(within(panel).getByText('0원')).toBeDefined();
});

it('hides 후원하기 from the streamer and once the broadcast is not LIVE', async () => {
  stubApi({
    'GET /api/auth/me': streamer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
  });
  renderAt('/broadcasts/b1');
  const panel = await donationPanel();
  await within(panel).findByText('아직 후원이 없습니다.');
  expect(within(panel).queryByRole('link', { name: '후원하기' })).toBeNull();
  cleanup();

  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast({ status: 'ENDED' }),
    [DONATIONS]: summary(),
  });
  renderAt('/broadcasts/b1');
  const ended = await donationPanel();
  await within(ended).findByText('아직 후원이 없습니다.');
  expect(within(ended).queryByRole('link', { name: '후원하기' })).toBeNull();
});

it('sends an anonymous viewer to log in and back to the broadcast', async () => {
  stubApi({
    'GET /api/auth/me': 401,
    'POST /api/auth/login': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
  });
  renderAt('/broadcasts/b1');
  const panel = await donationPanel();
  expect(within(panel).queryByRole('link', { name: '후원하기' })).toBeNull();
  fireEvent.click(
    within(panel).getByRole('link', { name: '로그인하고 후원해 보세요' }),
  );
  fireEvent.change(await screen.findByLabelText('이메일'), {
    target: { value: viewer.email },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  const back = await donationPanel();
  expect(
    await within(back).findByRole('button', { name: '후원하기' }),
  ).toBeDefined();
});

const ORDER_POST = 'POST /api/broadcasts/b1/donations';

it('rejects amounts outside 1,000원 to 100,000원 without placing an order', async () => {
  const calls = stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
  });
  renderAt('/broadcasts/b1/donate');
  const amount = await screen.findByLabelText('직접 입력 (원)');
  for (const bad of ['999', '100001', '1500.5', '']) {
    fireEvent.change(amount, { target: { value: bad } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      '1,000원부터 100,000원까지 후원할 수 있습니다.',
    );
  }
  expect(calls).not.toContain(ORDER_POST);
});

it('places the order, renders the widget for its amount and requests payment', async () => {
  const calls = stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [ORDER_POST]: new Reply(201, ORDER),
  });
  renderAt('/broadcasts/b1/donate');
  fireEvent.click(await screen.findByRole('button', { name: '5,000원' }));
  expect(
    screen
      .getByRole('button', { name: '5,000원' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.change(screen.getByLabelText('메시지 (선택)'), {
    target: { value: '  응원합니다  ' },
  });
  expect(screen.getByText('9/100')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: '다음' }));

  const pay = await screen.findByRole('button', { name: '결제하기' });
  expect(calls.bodies[ORDER_POST]).toEqual({
    amount: 5000,
    message: '응원합니다',
  });
  await waitFor(() => expect(pay).toHaveProperty('disabled', false));
  expect(toss.loadTossPayments).toHaveBeenCalledWith(ORDER.clientKey);
  expect(toss.widgetsFactory).toHaveBeenCalledWith({
    customerKey: ORDER.customerKey,
  });
  expect(toss.widgets.setAmount).toHaveBeenCalledWith({
    currency: 'KRW',
    value: 5000,
  });
  expect(toss.widgets.renderPaymentMethods).toHaveBeenCalledWith({
    selector: '#donation-payment-methods',
  });
  expect(toss.widgets.renderAgreement).toHaveBeenCalledWith({
    selector: '#donation-agreement',
  });
  expect(document.getElementById('donation-payment-methods')).not.toBeNull();

  fireEvent.click(pay);
  await waitFor(() =>
    expect(toss.widgets.requestPayment).toHaveBeenCalledWith({
      orderId: ORDER.orderId,
      orderName: ORDER.orderName,
      successUrl: `${window.location.origin}/donations/success`,
      failUrl: `${window.location.origin}/donations/fail`,
    }),
  );

  fireEvent.click(screen.getByRole('button', { name: '금액 바꾸기' }));
  expect(await screen.findByLabelText('직접 입력 (원)')).toHaveProperty(
    'value',
    '5000',
  );
});

it('shows the widget’s own message when the payment request fails', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [ORDER_POST]: new Reply(201, ORDER),
  });
  toss.widgets.requestPayment.mockRejectedValueOnce(
    new Error('필수 약관에 동의해 주세요.'),
  );
  renderAt('/broadcasts/b1/donate');
  fireEvent.click(await screen.findByRole('button', { name: '다음' }));
  const pay = await screen.findByRole('button', { name: '결제하기' });
  await waitFor(() => expect(pay).toHaveProperty('disabled', false));
  fireEvent.click(pay);
  expect((await screen.findByRole('alert')).textContent).toBe(
    '필수 약관에 동의해 주세요.',
  );
});

it.each([
  [403, '본인 방송에는 후원할 수 없습니다.'],
  [409, '방송 중일 때만 후원할 수 있습니다.'],
  [503, '후원 기능이 설정되지 않았습니다.'],
])(
  'shows the API’s message when the order is refused with %i',
  async (status, message) => {
    stubApi({
      'GET /api/auth/me': viewer,
      'GET /api/broadcasts/b1': broadcast(),
      [ORDER_POST]: new Reply(status, { statusCode: status, message }),
    });
    renderAt('/broadcasts/b1/donate');
    fireEvent.click(await screen.findByRole('button', { name: '다음' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.queryByRole('button', { name: '결제하기' })).toBeNull();
    expect(toss.loadTossPayments).not.toHaveBeenCalled();
  },
);

const CONFIRM = 'POST /api/donations/confirm';
const SUCCESS_PATH = `/donations/success?paymentType=NORMAL&orderId=${ORDER.orderId}&paymentKey=pk_1&amount=5000`;

it('confirms the payment once, even under StrictMode, and tells the watch tab', async () => {
  const heard: string[] = [];
  const watchTab = new BroadcastChannel('donations');
  watchTab.onmessage = (e: MessageEvent<{ broadcastId: string }>) =>
    heard.push(e.data.broadcastId);
  const confirmed: ConfirmedDonation = {
    ...donation({ amount: 5000 }),
    broadcastId: 'b1',
  };
  const calls = stubApi({
    'GET /api/auth/me': viewer,
    [CONFIRM]: confirmed,
  });
  renderAt(SUCCESS_PATH, { strict: true });
  expect(
    await screen.findByRole('heading', { name: '후원했습니다.' }),
  ).toBeDefined();
  expect(screen.getByText(/5,000원을 후원했습니다/)).toBeDefined();
  expect(calls.bodies[CONFIRM]).toEqual({
    paymentKey: 'pk_1',
    orderId: ORDER.orderId,
    amount: 5000,
  });
  expect(calls.filter((c) => c === CONFIRM)).toHaveLength(1);
  await waitFor(() => expect(heard).toEqual(['b1']));
  watchTab.close();
});

it('closes the payment tab on 방송으로 돌아가기', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    [CONFIRM]: { ...donation(), broadcastId: 'b1' },
  });
  const close = vi.spyOn(window, 'close').mockImplementation(() => {
    Object.defineProperty(window, 'closed', {
      configurable: true,
      value: true,
    });
  });
  renderAt(SUCCESS_PATH);
  fireEvent.click(
    await screen.findByRole('button', { name: '방송으로 돌아가기' }),
  );
  expect(close).toHaveBeenCalledOnce();
  expect(screen.getByRole('heading', { name: '후원했습니다.' })).toBeDefined();
  // 이렇게 하지 않으면 jsdom이 덮어쓴 값을 계속 갖고 있다.
  delete (window as { closed?: boolean }).closed;
});

// #114: 결제 뒤 방송을 지워도 후원은 남는다.
it('points to the broadcast list when the paid donation’s broadcast is gone', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    [CONFIRM]: { ...donation(), broadcastId: null },
  });
  const heard: unknown[] = [];
  const channel = new BroadcastChannel('donations');
  channel.onmessage = (event: MessageEvent) => heard.push(event.data);
  renderAt(SUCCESS_PATH);
  expect(
    await screen.findByRole('heading', { name: '후원했습니다.' }),
  ).toBeDefined();
  expect(
    screen.queryByRole('button', { name: '방송으로 돌아가기' }),
  ).toBeNull();
  expect(
    screen
      .getByRole('link', { name: '방송 목록으로 가기' })
      .getAttribute('href'),
  ).toBe('/');
  await new Promise((resolve) => setTimeout(resolve, 50));
  channel.close();
  expect(heard).toEqual([]);
});

it('goes to the broadcast when the browser will not close the tab', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
    [CONFIRM]: { ...donation(), broadcastId: 'b1' },
  });
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  renderAt(SUCCESS_PATH);
  fireEvent.click(
    await screen.findByRole('button', { name: '방송으로 돌아가기' }),
  );
  expect(close).toHaveBeenCalledOnce();
  expect(await donationPanel()).toBeDefined();
});

it('shows the API’s message when the confirm fails', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    [CONFIRM]: new Reply(400, { message: '결제 금액이 주문과 다릅니다.' }),
  });
  renderAt(SUCCESS_PATH);
  expect((await screen.findByRole('alert')).textContent).toBe(
    '결제 금액이 주문과 다릅니다.',
  );
  expect(
    screen.getByRole('link', { name: '방송 목록으로 가기' }),
  ).toBeDefined();
});

// #114: 주문은 지워진 방송보다 오래 남았다. 주문한 탭은
// 아직 방송을 알지만 돌아갈 곳이 없다. 다른
// 409라면 버튼이 남는다.
it('offers no way back to a broadcast the confirm says was deleted', async () => {
  sessionStorage.setItem(`donation-order:${ORDER.orderId}`, 'b1');
  stubApi({
    'GET /api/auth/me': viewer,
    [CONFIRM]: new Reply(409, {
      message: '방송이 삭제되어 후원할 수 없습니다.',
      code: 'BROADCAST_DELETED',
    }),
  });
  renderAt(SUCCESS_PATH);
  expect((await screen.findByRole('alert')).textContent).toBe(
    '방송이 삭제되어 후원할 수 없습니다.',
  );
  expect(
    screen.queryByRole('button', { name: '방송으로 돌아가기' }),
  ).toBeNull();
  expect(
    screen.getByRole('link', { name: '방송 목록으로 가기' }),
  ).toBeDefined();
  cleanup();

  stubApi({
    'GET /api/auth/me': viewer,
    [CONFIRM]: new Reply(409, { message: '이미 다른 주문에 쓰인 결제입니다.' }),
  });
  renderAt(SUCCESS_PATH);
  expect(
    await screen.findByRole('button', { name: '방송으로 돌아가기' }),
  ).toBeDefined();
});

it('does not confirm when the redirect lost its payment details', async () => {
  const calls = stubApi({ 'GET /api/auth/me': viewer });
  renderAt('/donations/success?orderId=x&amount=abc');
  expect((await screen.findByRole('alert')).textContent).toBe(
    '결제 정보가 올바르지 않습니다.',
  );
  expect(calls).not.toContain(CONFIRM);
});

it('says the payment was canceled when the buyer closed the window', async () => {
  stubApi({ 'GET /api/auth/me': viewer });
  sessionStorage.setItem(`donation-order:${ORDER.orderId}`, 'b1');
  renderAt(
    `/donations/fail?code=PAY_PROCESS_CANCELED&message=${encodeURIComponent('사용자에 의해 결제가 취소되었습니다.')}&orderId=${ORDER.orderId}`,
  );
  expect(
    await screen.findByRole('heading', { name: '결제를 취소했습니다.' }),
  ).toBeDefined();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    screen.getByRole('link', { name: '다시 후원하기' }).getAttribute('href'),
  ).toBe('/broadcasts/b1/donate');
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: '방송으로 돌아가기' }));
  expect(close).toHaveBeenCalledOnce();
});

it('shows Toss’s message when the payment failed', async () => {
  stubApi({ 'GET /api/auth/me': 401 });
  renderAt(
    `/donations/fail?code=REJECT_CARD_COMPANY&message=${encodeURIComponent('카드사에서 거절했습니다.')}&orderId=unknown`,
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    '카드사에서 거절했습니다.',
  );
  expect(
    screen.getByRole('link', { name: '방송 목록으로 가기' }),
  ).toBeDefined();
});

// 시청 페이지에서 하는 라임 후원(PRD-lime 7.3, #110).

const LIME = 'GET /api/me/lime';
const LIME_POST = 'POST /api/broadcasts/b1/lime-donations';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const limeDonation = (amount: number, message = ''): ConfirmedDonation => ({
  ...donation({ id: 'lime1', method: 'LIME', amount, message }),
  broadcastId: 'b1',
});

async function limeForm() {
  const panel = await donationPanel();
  return within(panel).findByRole('form', { name: '라임으로 후원' });
}

function sentKeys(calls: { body?: BodyInit | null }[]): string[] {
  return calls.map(
    (init) => (JSON.parse(init.body as string) as { orderId: string }).orderId,
  );
}

it('donates lime from the balance and shows it without leaving the page', async () => {
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
    [LIME]: { balance: 10_000 },
    [LIME_POST]: new Reply(201, limeDonation(3_000, '응원')),
  };
  const calls = stubApi(routes);
  renderAt('/broadcasts/b1');
  const form = await limeForm();
  expect(
    await within(form).findByText('10,000라임', { selector: 'strong' }),
  ).toBeDefined();
  fireEvent.change(within(form).getByLabelText('직접 입력 (라임)'), {
    target: { value: '3000' },
  });
  fireEvent.change(within(form).getByLabelText(/메시지/), {
    target: { value: '  응원  ' },
  });

  routes[DONATIONS] = summary({
    total: 3_000,
    count: 1,
    donations: [limeDonation(3_000, '응원')],
  });
  routes[LIME] = { balance: 7_000 };
  fireEvent.click(within(form).getByRole('button', { name: '라임으로 후원' }));

  const panel = await donationPanel();
  expect(
    await within(panel).findByText('7,000라임', { selector: 'strong' }),
  ).toBeDefined();
  const item = await within(panel).findByRole('listitem');
  expect(within(item).getByText('3,000라임')).toBeDefined();
  expect(within(item).getByText('응원')).toBeDefined();
  expect(
    within(panel).getByText('3,000원', { selector: 'strong' }),
  ).toBeDefined();
  expect(within(panel).getByRole('status').textContent).toBe(
    '후원이 반영되었습니다',
  );
  expect(calls.bodies[LIME_POST]).toEqual({
    amount: 3_000,
    message: '응원',
    orderId: expect.stringMatching(UUID) as string,
  });
  expect(within(form).getByLabelText<HTMLInputElement>(/메시지/).value).toBe(
    '',
  );
  // 여전히 시청 페이지다.
  expect(
    screen.getByRole('heading', { level: 1, name: '저녁 방송' }),
  ).toBeDefined();
});

it('offers 충전하기 and 카드로 후원 in new tabs when the balance is short', async () => {
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
    [LIME]: { balance: 2_000 },
  });
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  renderAt('/broadcasts/b1');
  const form = await limeForm();
  await within(form).findByText('2,000라임', { selector: 'strong' });
  fireEvent.click(within(form).getByRole('button', { name: '5,000라임' }));
  expect(
    within(form).queryByRole('button', { name: '라임으로 후원' }),
  ).toBeNull();
  expect(within(form).getByText('라임이 3,000라임 부족합니다.')).toBeDefined();

  fireEvent.click(within(form).getByRole('button', { name: '충전하기' }));
  expect(open).toHaveBeenLastCalledWith('/lime/charge', '_blank');
  fireEvent.click(within(form).getByRole('button', { name: '카드로 후원' }));
  expect(open).toHaveBeenLastCalledWith('/broadcasts/b1/donate', '_blank');

  fireEvent.click(within(form).getByRole('button', { name: '1,000라임' }));
  expect(
    within(form).getByRole('button', { name: '라임으로 후원' }),
  ).toBeDefined();
  expect(within(form).queryByRole('button', { name: '충전하기' })).toBeNull();
});

it('re-reads the balance as soon as a charge tab reports a top-up', async () => {
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
    [LIME]: { balance: 0 },
  };
  stubApi(routes);
  renderAt('/broadcasts/b1');
  const form = await limeForm();
  await within(form).findByText('0라임', { selector: 'strong' });
  expect(within(form).getByRole('button', { name: '충전하기' })).toBeDefined();

  routes[LIME] = { balance: 10_000 };
  const charge = new BroadcastChannel('donations');
  charge.postMessage({ type: 'charged' });
  charge.close();
  // 30 s 폴링보다 한참 이르므로, 메시지 말고는 원인이 될 수 없다.
  expect(
    await within(form).findByText('10,000라임', { selector: 'strong' }),
  ).toBeDefined();
  expect(
    within(form).getByRole('button', { name: '라임으로 후원' }),
  ).toBeDefined();
});

it('resends a lost attempt with its key and gives the next donation a new one', async () => {
  const sent: RequestInit[] = [];
  const answers = [
    () => Promise.reject(new TypeError('Failed to fetch')),
    () => Promise.resolve(Response.json(limeDonation(1_000), { status: 201 })),
    () => Promise.resolve(Response.json(limeDonation(1_000), { status: 201 })),
  ];
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
    [LIME]: { balance: 10_000 },
    [LIME_POST]: (init: RequestInit) => {
      sent.push(init);
      return answers[sent.length - 1]();
    },
  });
  renderAt('/broadcasts/b1');
  const form = await limeForm();
  await within(form).findByText('10,000라임', { selector: 'strong' });
  const donate = () =>
    fireEvent.click(
      within(form).getByRole('button', { name: '라임으로 후원' }),
    );

  donate();
  expect((await within(form).findByRole('alert')).textContent).toBe(
    '후원 결과를 확인하지 못했습니다. 금액과 메시지를 그대로 두고 다시 누르면 두 번 후원되지 않습니다.',
  );
  donate();
  await waitFor(() => expect(sent).toHaveLength(2));
  await waitFor(() => expect(within(form).queryByRole('alert')).toBeNull());
  donate();
  await waitFor(() => expect(sent).toHaveLength(3));
  const [lost, resent, next] = sentKeys(sent);
  expect(lost).toMatch(UUID);
  expect(resent).toBe(lost);
  expect(next).not.toBe(lost);
});

// 후원은 처리됐지만 응답을 잃었다. 폼은 실패했다고
// 말하면 안 되고, 바뀐 값을 다시 읽어야 하며, 다시 읽은 잔액이 모자라도
// 같은 키로 다시 보낼 수 있게 해야 한다.
it('re-reads after a lost answer and keeps the resend open when the balance fell short', async () => {
  const sent: RequestInit[] = [];
  const routes: Record<string, unknown> = {
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
    [LIME]: { balance: 5_000 },
  };
  routes[LIME_POST] = (init: RequestInit) => {
    sent.push(init);
    if (sent.length === 1) {
      // 서버에서 커밋된 뒤 연결이 끊겼다.
      routes[LIME] = { balance: 0 };
      routes[DONATIONS] = summary({
        total: 5_000,
        count: 1,
        donations: [donation({ id: 'lime1', method: 'LIME', amount: 5_000 })],
      });
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve(Response.json(limeDonation(5_000), { status: 200 }));
  };
  stubApi(routes);
  renderAt('/broadcasts/b1');
  const form = await limeForm();
  await within(form).findByText('5,000라임', { selector: 'strong' });
  fireEvent.click(within(form).getByRole('button', { name: '5,000라임' }));
  fireEvent.click(within(form).getByRole('button', { name: '라임으로 후원' }));

  expect((await within(form).findByRole('alert')).textContent).toBe(
    '후원 결과를 확인하지 못했습니다. 금액과 메시지를 그대로 두고 다시 누르면 두 번 후원되지 않습니다.',
  );
  // 두 폴링보다 한참 이르게 바로 다시 읽는다.
  await within(form).findByText('0라임', { selector: 'strong' });
  const panel = await donationPanel();
  expect(
    await within(panel).findByText('5,000원', { selector: 'strong' }),
  ).toBeDefined();
  // 0 라임은 5,000에 모자라지만, 이 시도는 다시 보낼 수 있다.
  expect(within(form).queryByRole('button', { name: '충전하기' })).toBeNull();
  fireEvent.click(within(form).getByRole('button', { name: '라임으로 후원' }));
  await waitFor(() => expect(sent).toHaveLength(2));
  const [lost, resent] = sentKeys(sent);
  expect(resent).toBe(lost);
  await waitFor(() => expect(within(form).queryByRole('alert')).toBeNull());
  // 결론이 났다. 다른 금액은 새 시도이고, 이제는 잔액이 모자라다.
  fireEvent.click(within(form).getByRole('button', { name: '1,000라임' }));
  expect(
    await within(form).findByRole('button', { name: '충전하기' }),
  ).toBeDefined();
});

it('gives a new key once the attempt changes after a lost response', async () => {
  const sent: RequestInit[] = [];
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
    [LIME]: { balance: 10_000 },
    [LIME_POST]: (init: RequestInit) => {
      sent.push(init);
      return Promise.reject(new TypeError('Failed to fetch'));
    },
  });
  renderAt('/broadcasts/b1');
  const form = await limeForm();
  await within(form).findByText('10,000라임', { selector: 'strong' });
  fireEvent.click(within(form).getByRole('button', { name: '라임으로 후원' }));
  await within(form).findByRole('alert');
  fireEvent.click(within(form).getByRole('button', { name: '5,000라임' }));
  fireEvent.click(within(form).getByRole('button', { name: '라임으로 후원' }));
  await waitFor(() => expect(sent).toHaveLength(2));
  const [first, second] = sentKeys(sent);
  expect(second).not.toBe(first);
});

it('disables the button while the donation is in flight', async () => {
  let answer: (res: Response) => void = () => {};
  let posts = 0;
  stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
    [LIME]: { balance: 10_000 },
    [LIME_POST]: () => {
      posts += 1;
      return new Promise<Response>((resolve) => {
        answer = resolve;
      });
    },
  });
  renderAt('/broadcasts/b1');
  const form = await limeForm();
  await within(form).findByText('10,000라임', { selector: 'strong' });
  fireEvent.click(within(form).getByRole('button', { name: '라임으로 후원' }));
  const busy = await within(form).findByRole('button', {
    name: '후원하는 중…',
  });
  expect((busy as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(busy);
  fireEvent.submit(form);
  expect(posts).toBe(1);
  answer(Response.json(limeDonation(1_000), { status: 201 }));
  const ready = await within(form).findByRole('button', {
    name: '라임으로 후원',
  });
  expect((ready as HTMLButtonElement).disabled).toBe(false);
});

it('shows the API’s message when the server refuses the donation', async () => {
  const calls = stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
    [LIME]: { balance: 10_000 },
    [LIME_POST]: new Reply(409, { message: '라임이 부족합니다.' }),
  });
  renderAt('/broadcasts/b1');
  const form = await limeForm();
  await within(form).findByText('10,000라임', { selector: 'strong' });
  const balanceReads = calls.filter((c) => c === LIME).length;
  fireEvent.click(within(form).getByRole('button', { name: '라임으로 후원' }));
  expect((await within(form).findByRole('alert')).textContent).toBe(
    '라임이 부족합니다.',
  );
  // 그사이 잔액이 바뀌어서 다시 읽는다.
  await waitFor(() =>
    expect(calls.filter((c) => c === LIME).length).toBeGreaterThan(
      balanceReads,
    ),
  );
});

it('rejects amounts outside 1,000라임 to 100,000라임 without sending', async () => {
  const calls = stubApi({
    'GET /api/auth/me': viewer,
    'GET /api/broadcasts/b1': broadcast(),
    [DONATIONS]: summary(),
    [LIME]: { balance: 1_000_000 },
  });
  renderAt('/broadcasts/b1');
  const form = await limeForm();
  await within(form).findByText('1,000,000라임', { selector: 'strong' });
  for (const bad of ['999', '100001', '1500.5', '']) {
    fireEvent.change(within(form).getByLabelText('직접 입력 (라임)'), {
      target: { value: bad },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: '라임으로 후원' }),
    );
    expect((await within(form).findByRole('alert')).textContent).toBe(
      '1,000라임부터 100,000라임까지 후원할 수 있습니다.',
    );
  }
  expect(calls).not.toContain(LIME_POST);
});

it('shows the lime form only to a logged-in viewer of a LIVE broadcast', async () => {
  const cases: [typeof viewer | number, Broadcast][] = [
    [streamer, broadcast()],
    [viewer, broadcast({ status: 'ENDED' })],
    [viewer, broadcast({ status: 'READY' })],
    [401, broadcast()],
  ];
  for (const [me, b] of cases) {
    const calls = stubApi({
      'GET /api/auth/me': me,
      'GET /api/broadcasts/b1': b,
      [DONATIONS]: summary(),
      [LIME]: { balance: 10_000 },
    });
    renderAt('/broadcasts/b1');
    const panel = await donationPanel();
    await within(panel).findByText('아직 후원이 없습니다.');
    expect(
      within(panel).queryByRole('form', { name: '라임으로 후원' }),
    ).toBeNull();
    expect(calls).not.toContain(LIME);
    cleanup();
  }
});
