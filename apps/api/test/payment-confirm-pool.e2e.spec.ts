import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CONFIRM_CONCURRENCY,
  CONFIRM_RATE_LIMIT,
} from '../src/donations/confirm-gate.js';
import {
  PG_CONNECTION_TIMEOUT_MS,
  PG_POOL,
  PG_POOL_MAX,
  PrismaService,
} from '../src/database/database.module.js';
import type { DonationOrder } from '../src/donations/donations.service.js';
import { TossPaymentsError } from '../src/donations/toss-payments.js';
import type { LimeChargeOrder } from '../src/lime/lime.service.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';
import {
  fakeTossPaymentsOf,
  type FakeTossPayments,
} from './support/fake-toss-payments.js';

type Buyer = { user: TestUser; agent: TestAgent };

// #215: 결제 확정은 Toss 응답을 기다리는 동안 공유 pg pool의 연결을 쥔다.
// 한 사용자가 확정을 몰아 보내도 다른 사용자의 요청이 줄을 서지 않아야 한다.
describe('payment confirm and the shared pg pool', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let toss: FakeTossPayments;
  let broadcastId: string;

  const limeOrder = async (buyer: Buyer, amount = 1_000) => {
    const res = await buyer.agent.post('/api/lime/charges').send({ amount });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { orderId } = res.body as LimeChargeOrder;
    return { paymentKey: `pay_${orderId}`, orderId, amount };
  };
  const donationOrder = async (buyer: Buyer, amount = 1_000) => {
    const res = await buyer.agent
      .post(`/api/broadcasts/${broadcastId}/donations`)
      .send({ amount, message: '' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { orderId } = res.body as DonationOrder;
    return { paymentKey: `pay_${orderId}`, orderId, amount };
  };
  const confirmLime = (buyer: Buyer, body: object) =>
    buyer.agent.post('/api/lime/charges/confirm').send(body);
  const confirmDonation = (buyer: Buyer, body: object) =>
    buyer.agent.post('/api/donations/confirm').send(body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    toss = fakeTossPaymentsOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    toss.reset();
    const streamer = await signUpAndLogIn(app, { nickname: '불씨' });
    const row = await prisma.broadcast.create({
      data: {
        streamerId: streamer.user.id,
        title: '라임 방송',
        status: 'LIVE',
        startedAt: new Date(),
      },
    });
    broadcastId = row.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('bounds the pool and how long a request waits for a connection', () => {
    const pool = app.get<pg.Pool>(PG_POOL);
    expect(pool.options.max).toBe(PG_POOL_MAX);
    expect(pool.options.connectionTimeoutMillis).toBe(PG_CONNECTION_TIMEOUT_MS);
  });

  it(
    'keeps another user’s requests fast while one user floods confirms of one order',
    { timeout: 30_000 },
    async () => {
      const attacker = await signUpAndLogIn(app, { nickname: '공격자' });
      const viewer = await signUpAndLogIn(app, { nickname: '시청자' });
      const { orderId, amount } = await limeOrder(attacker);
      toss.delayMs = 300;
      toss.failure = new TossPaymentsError(404, 'NOT_FOUND_PAYMENT', '없음');
      // 수정 전에는 같은 주문 20개에서 시청자의 /auth/me가 4.8초 걸렸다.
      const flood = Promise.all(
        Array.from({ length: CONFIRM_RATE_LIMIT.limit }, (_, i) =>
          confirmLime(attacker, { paymentKey: `fake_${i}`, orderId, amount }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      for (let i = 0; i < 3; i++) {
        const started = performance.now();
        const res = await viewer.agent.get('/api/auth/me');
        expect(res.status).toBe(200);
        expect(performance.now() - started).toBeLessThan(1_000);
      }
      const results = await flood;
      expect(results.every((r) => r.status === 400)).toBe(true);
      expect(toss.maxInFlight).toBe(1);
    },
  );

  it('lets one user’s charge and card donation wait for Toss one at a time', async () => {
    const buyer = await signUpAndLogIn(app, { nickname: '구매자' });
    const charges = [await limeOrder(buyer), await limeOrder(buyer, 2_000)];
    const donation = await donationOrder(buyer);
    toss.delayMs = 100;
    const results = await Promise.all([
      ...charges.map((p) => confirmLime(buyer, p)),
      confirmDonation(buyer, donation),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(toss.maxInFlight).toBe(1);
  });

  it('caps how many users wait for Toss at once and still confirms them all', async () => {
    const buyers: Buyer[] = [];
    for (let i = 0; i < CONFIRM_CONCURRENCY + 3; i++) {
      buyers.push(await signUpAndLogIn(app, { nickname: `구매자${i}` }));
    }
    const payments: object[] = [];
    for (const buyer of buyers) payments.push(await limeOrder(buyer));
    toss.delayMs = 200;
    const results = await Promise.all(
      buyers.map((buyer, i) => confirmLime(buyer, payments[i] ?? {})),
    );
    expect(results.map((r) => r.status)).toEqual(buyers.map(() => 200));
    expect(toss.maxInFlight).toBe(CONFIRM_CONCURRENCY);
  });

  describe.each([
    ['lime charge', '/api/lime/charges/confirm'],
    ['card donation', '/api/donations/confirm'],
  ])('%s confirm rate limit', (_, path) => {
    it('answers 429 past the limit without asking Toss, per user', async () => {
      const flooder = await signUpAndLogIn(app, { nickname: '연타' });
      const other = await signUpAndLogIn(app, { nickname: '다른사람' });
      // 두 사람이 같은 IP(같은 공유기)에서 보낸다.
      const send = (buyer: Buyer, body: object) =>
        buyer.agent.post(path).set('X-Forwarded-For', '10.250.0.1').send(body);
      const missing = {
        paymentKey: 'pay_x',
        orderId: 'no_such',
        amount: 1_000,
      };
      for (let i = 0; i < CONFIRM_RATE_LIMIT.limit; i++) {
        expect((await send(flooder, missing)).status).toBe(404);
      }
      const payment =
        path === '/api/donations/confirm'
          ? await donationOrder(flooder)
          : await limeOrder(flooder);
      const limited = await send(flooder, payment);
      expect(limited.status).toBe(429);
      expect(toss.calls).toHaveLength(0);
      // 제한은 IP가 아니라 사용자 기준이다. 같은 IP의 다른 사용자는 확정한다.
      const own =
        path === '/api/donations/confirm'
          ? await donationOrder(other)
          : await limeOrder(other);
      expect((await send(other, own)).status).toBe(200);
    });
  });
});
