import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import type { ConfirmedCharge, LimeChargeOrder } from './lime';

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
  toss.loadTossPayments.mockResolvedValue({ widgets: toss.widgetsFactory });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  // 이렇게 하지 않으면 jsdom이 덮어쓴 `closed`를 계속 갖고 있다.
  delete (window as { closed?: boolean }).closed;
});

const buyer = { id: 'u2', email: 'b@example.com', nickname: '구경꾼' };

const ORDER: LimeChargeOrder = {
  orderId: 'lime_0123456789abcdef0123456789abcdef',
  orderName: '10,000라임 충전',
  amount: 10_000,
  clientKey: 'test_gck_docs_fake',
  customerKey: buyer.id,
};

const CHARGED: ConfirmedCharge = {
  orderId: ORDER.orderId,
  amount: 10_000,
  approvedAt: '2026-11-13T01:00:00.000Z',
  balanceAfter: 12_000,
};

class Reply {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

// 각 `METHOD /api/path`에 표의 값으로 답하고, 나머지는 404다.
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

function closableWindow() {
  return vi.spyOn(window, 'close').mockImplementation(() => {
    Object.defineProperty(window, 'closed', {
      configurable: true,
      value: true,
    });
  });
}

const ORDER_POST = 'POST /api/lime/charges';
const CONFIRM = 'POST /api/lime/charges/confirm';
const SUCCESS_PATH = `/lime/charge/success?paymentType=NORMAL&orderId=${ORDER.orderId}&paymentKey=pk_1&amount=10000`;

it('rejects amounts outside 1,000라임 to 100,000라임 without placing an order', async () => {
  const calls = stubApi({ 'GET /api/auth/me': buyer });
  renderAt('/lime/charge');
  const amount = await screen.findByLabelText('직접 입력 (라임)');
  for (const bad of ['999', '100001', '1500.5', '']) {
    fireEvent.change(amount, { target: { value: bad } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      '1,000라임부터 100,000라임까지 충전할 수 있습니다.',
    );
  }
  expect(calls).not.toContain(ORDER_POST);
});

it('places a charge order and pays it through the Toss widget', async () => {
  const calls = stubApi({
    'GET /api/auth/me': buyer,
    [ORDER_POST]: new Reply(201, ORDER),
  });
  renderAt('/lime/charge');
  expect(
    await screen.findByRole('button', { name: '1,000라임' }),
  ).toBeDefined();
  expect(screen.getByRole('button', { name: '5,000라임' })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: '10,000라임' }));
  expect(
    screen
      .getByRole('button', { name: '10,000라임' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: '다음' }));

  const pay = await screen.findByRole('button', { name: '결제하기' });
  expect(calls.bodies[ORDER_POST]).toEqual({ amount: 10_000 });
  await waitFor(() => expect(pay).toHaveProperty('disabled', false));
  expect(toss.widgets.setAmount).toHaveBeenCalledWith({
    currency: 'KRW',
    value: 10_000,
  });
  fireEvent.click(pay);
  await waitFor(() =>
    expect(toss.widgets.requestPayment).toHaveBeenCalledWith({
      orderId: ORDER.orderId,
      orderName: ORDER.orderName,
      successUrl: `${window.location.origin}/lime/charge/success`,
      failUrl: `${window.location.origin}/lime/charge/fail`,
    }),
  );
});

it('sends an anonymous visitor to log in', async () => {
  stubApi({ 'GET /api/auth/me': 401 });
  renderAt('/lime/charge');
  expect(await screen.findByRole('heading', { name: '로그인' })).toBeDefined();
});

it('confirms the charge once, even under StrictMode, and tells the watch tab', async () => {
  const heard: unknown[] = [];
  const watchTab = new BroadcastChannel('donations');
  watchTab.onmessage = (e: MessageEvent) => heard.push(e.data);
  const calls = stubApi({ 'GET /api/auth/me': buyer, [CONFIRM]: CHARGED });
  renderAt(SUCCESS_PATH, { strict: true });
  expect(
    await screen.findByRole('heading', { name: '충전했습니다.' }),
  ).toBeDefined();
  expect(
    screen.getByText('10,000라임을 충전했습니다. 잔액은 12,000라임입니다.'),
  ).toBeDefined();
  expect(calls.bodies[CONFIRM]).toEqual({
    paymentKey: 'pk_1',
    orderId: ORDER.orderId,
    amount: 10_000,
  });
  expect(calls.filter((c) => c === CONFIRM)).toHaveLength(1);
  await waitFor(() => expect(heard).toEqual([{ type: 'charged' }]));
  watchTab.close();
});

it('closes the charge tab on 돌아가기', async () => {
  stubApi({ 'GET /api/auth/me': buyer, [CONFIRM]: CHARGED });
  const close = closableWindow();
  renderAt(SUCCESS_PATH);
  fireEvent.click(await screen.findByRole('button', { name: '돌아가기' }));
  expect(close).toHaveBeenCalledOnce();
  expect(screen.getByRole('heading', { name: '충전했습니다.' })).toBeDefined();
});

it('goes home when the browser will not close the tab', async () => {
  stubApi({
    'GET /api/auth/me': buyer,
    [CONFIRM]: CHARGED,
    'GET /api/broadcasts': [],
  });
  vi.spyOn(window, 'close').mockImplementation(() => {});
  renderAt(SUCCESS_PATH);
  fireEvent.click(await screen.findByRole('button', { name: '돌아가기' }));
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: '충전했습니다.' })).toBeNull(),
  );
});

it('shows the API’s message when the confirm fails', async () => {
  stubApi({
    'GET /api/auth/me': buyer,
    [CONFIRM]: new Reply(400, { message: '결제 금액이 주문과 다릅니다.' }),
  });
  renderAt(SUCCESS_PATH);
  expect((await screen.findByRole('alert')).textContent).toBe(
    '결제 금액이 주문과 다릅니다.',
  );
  expect(
    screen.getByRole('link', { name: '다시 충전하기' }).getAttribute('href'),
  ).toBe('/lime/charge');
});

it('does not confirm when the redirect lost its payment details', async () => {
  const calls = stubApi({ 'GET /api/auth/me': buyer });
  renderAt('/lime/charge/success?orderId=x&amount=abc');
  expect((await screen.findByRole('alert')).textContent).toBe(
    '결제 정보가 올바르지 않습니다.',
  );
  expect(calls).not.toContain(CONFIRM);
});

it('says the payment was canceled and offers to charge again', async () => {
  stubApi({ 'GET /api/auth/me': buyer });
  renderAt(
    `/lime/charge/fail?code=PAY_PROCESS_CANCELED&message=x&orderId=${ORDER.orderId}`,
  );
  expect(
    await screen.findByRole('heading', { name: '결제를 취소했습니다.' }),
  ).toBeDefined();
  expect(screen.queryByRole('alert')).toBeNull();
  const close = closableWindow();
  fireEvent.click(screen.getByRole('button', { name: '돌아가기' }));
  expect(close).toHaveBeenCalledOnce();
});

it('shows Toss’s message when the charge payment failed', async () => {
  stubApi({ 'GET /api/auth/me': buyer });
  renderAt(
    `/lime/charge/fail?code=REJECT_CARD_COMPANY&message=${encodeURIComponent('카드사에서 거절했습니다.')}&orderId=${ORDER.orderId}`,
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    '카드사에서 거절했습니다.',
  );
});
