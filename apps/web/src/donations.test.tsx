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
    status: 'LIVE',
    startedAt: null,
    endedAt: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    recordingFiles: [],
    thumbnailUrl: null,
    streamer: { id: streamer.id, nickname: streamer.nickname },
    ...overrides,
  };
}

function donation(overrides: Partial<Donation> = {}): Donation {
  return {
    id: 'd1',
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

// A non-2xx answer with a JSON body.
class Reply {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

// Answers each `METHOD /api/path` from the table; anything else is a 404.
// `bodies` keeps what each call sent, keyed the same way.
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
  expect(
    within(panel).getByRole('link', { name: '후원하기' }).getAttribute('href'),
  ).toBe('/broadcasts/b1/donate');
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
    await within(back).findByRole('link', { name: '후원하기' }),
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

it('confirms the payment once, even under StrictMode, and links back to the broadcast', async () => {
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
  expect(
    screen
      .getByRole('link', { name: '방송으로 돌아가기' })
      .getAttribute('href'),
  ).toBe('/broadcasts/b1');
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
