import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpTossPayments,
  TossPaymentsError,
  tossConfigFromEnv,
} from '../src/donations/toss-payments.js';

const INPUT = { paymentKey: 'pay_1', orderId: 'don_1', amount: 1000 };

const APPROVED = {
  paymentKey: 'pay_1',
  orderId: 'don_1',
  status: 'DONE',
  totalAmount: 1000,
  approvedAt: '2026-11-10T12:00:00+09:00',
  method: '카드',
};

describe('HttpTossPayments', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  const answer = (status: number, body: string) =>
    fetchMock.mockResolvedValue(new Response(body, { status }));

  const toss = () =>
    new HttpTossPayments({ clientKey: 'test_ck', secretKey: 'test_sk' });

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the confirm with the secret key as Basic auth and the order as Idempotency-Key', async () => {
    answer(200, JSON.stringify(APPROVED));
    await toss().confirm(INPUT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.tosspayments.com/v1/payments/confirm');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      authorization: `Basic ${Buffer.from('test_sk:').toString('base64')}`,
      'idempotency-key': 'don_1',
      'content-type': 'application/json',
    });
    expect(JSON.parse(init?.body as string)).toEqual(INPUT);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns the approved payment', async () => {
    answer(200, JSON.stringify(APPROVED));
    await expect(toss().confirm(INPUT)).resolves.toEqual({
      paymentKey: 'pay_1',
      orderId: 'don_1',
      status: 'DONE',
      totalAmount: 1000,
      approvedAt: '2026-11-10T12:00:00+09:00',
    });
  });

  it.each([400, 404, 500])(
    'turns a %i error body into a TossPaymentsError',
    async (status) => {
      answer(
        status,
        JSON.stringify({
          code: 'ALREADY_PROCESSED_PAYMENT',
          message: '이미 처리된 결제 입니다.',
        }),
      );
      const error = await toss()
        .confirm(INPUT)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TossPaymentsError);
      expect(error).toMatchObject({
        httpStatus: status,
        code: 'ALREADY_PROCESSED_PAYMENT',
        message: '이미 처리된 결제 입니다.',
      });
    },
  );

  it.each([
    ['a non-JSON error', 502, '<html>Bad Gateway</html>'],
    ['an approval missing fields', 200, JSON.stringify({ status: 'DONE' })],
    ['a non-JSON approval', 200, 'ok'],
  ])('throws a plain error on %s', async (_label, status, body) => {
    answer(status, body);
    const error = await toss()
      .confirm(INPUT)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TossPaymentsError);
  });

  it('passes a network failure on', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(toss().confirm(INPUT)).rejects.toThrow('fetch failed');
  });
});

describe('tossConfigFromEnv', () => {
  it('reads both keys', () => {
    expect(
      tossConfigFromEnv({ TOSS_CLIENT_KEY: 'ck', TOSS_SECRET_KEY: 'sk' }),
    ).toEqual({ clientKey: 'ck', secretKey: 'sk' });
  });

  it.each([
    { TOSS_CLIENT_KEY: '', TOSS_SECRET_KEY: 'sk' },
    { TOSS_CLIENT_KEY: 'ck', TOSS_SECRET_KEY: '' },
    { TOSS_CLIENT_KEY: 'ck' },
    {},
  ])('turns donations off when a key is empty: %o', (env) => {
    expect(tossConfigFromEnv(env)).toBeNull();
  });
});
