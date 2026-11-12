import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { PrismaService } from '../src/database/database.module.js';
import { TossPaymentsError } from '../src/donations/toss-payments.js';
import {
  LIME_CHARGE_MAX_AMOUNT,
  LIME_CHARGE_MIN_AMOUNT,
  type LimeChargeOrder,
} from '../src/lime/lime.service.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';
import {
  fakeTossPaymentsOf,
  TEST_TOSS_CONFIG,
  type FakeTossPayments,
} from './support/fake-toss-payments.js';
import { expectLedgerMatchesBalances } from './support/lime.js';

interface ChargeJson {
  orderId: string;
  amount: number;
  approvedAt: string;
  balanceAfter: number;
}

describe('lime charges', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let toss: FakeTossPayments;
  let buyer: { user: TestUser; agent: TestAgent };
  let other: { user: TestUser; agent: TestAgent };

  const anonymous = () => request(app.getHttpServer());
  const charge = (agent: TestAgent, body: unknown) =>
    agent.post('/api/lime/charges').send(body as object);
  const confirm = (agent: TestAgent, body: unknown) =>
    agent.post('/api/lime/charges/confirm').send(body as object);
  const balanceOf = async (agent: TestAgent) => {
    const res = await agent.get('/api/me/lime');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body as { balance: number }).balance;
  };
  const ledgerCount = () => prisma.limeLedger.count();

  // Orders a charge and returns what the success page would post back.
  const ordered = async (amount = 10_000, agent = buyer.agent) => {
    const res = await charge(agent, { amount });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { orderId } = res.body as LimeChargeOrder;
    return { paymentKey: `pay_${orderId}`, orderId, amount };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    toss = fakeTossPaymentsOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    toss.reset();
    buyer = await signUpAndLogIn(app, { nickname: '충전자' });
    other = await signUpAndLogIn(app, { nickname: '다른사람' });
  });

  afterEach(async () => {
    await expectLedgerMatchesBalances(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('ordering', () => {
    it('hands the payment widget an order for the buyer', async () => {
      const res = await charge(buyer.agent, { amount: 10_000 });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        orderId: expect.stringMatching(/^lime_[0-9a-f]{32}$/) as string,
        orderName: '10,000라임 충전',
        amount: 10_000,
        clientKey: TEST_TOSS_CONFIG.clientKey,
        customerKey: buyer.user.id,
      });
      const row = await prisma.limeCharge.findUniqueOrThrow({
        where: { orderId: (res.body as LimeChargeOrder).orderId },
      });
      expect(row).toMatchObject({
        userId: buyer.user.id,
        amount: 10_000,
        status: 'PENDING',
        paymentKey: null,
      });
      expect(await balanceOf(buyer.agent)).toBe(0);
    });

    it.each([LIME_CHARGE_MIN_AMOUNT, LIME_CHARGE_MAX_AMOUNT])(
      'accepts %i lime',
      async (amount) => {
        expect((await charge(buyer.agent, { amount })).status).toBe(201);
      },
    );

    it.each([
      ['below the minimum', { amount: LIME_CHARGE_MIN_AMOUNT - 1 }],
      ['above the maximum', { amount: LIME_CHARGE_MAX_AMOUNT + 1 }],
      ['fractional', { amount: 1000.5 }],
      ['a string amount', { amount: '1000' }],
      ['missing amount', {}],
    ])('rejects %s with 400', async (_label, body) => {
      expect((await charge(buyer.agent, body)).status).toBe(400);
      expect(await prisma.limeCharge.count()).toBe(0);
    });

    it('rejects anonymous orders with 401', async () => {
      const res = await anonymous()
        .post('/api/lime/charges')
        .send({ amount: 1000 });
      expect(res.status).toBe(401);
      expect(await prisma.limeCharge.count()).toBe(0);
    });
  });

  describe('confirming', () => {
    it('credits the balance and writes one ledger row', async () => {
      const payment = await ordered(10_000);
      const res = await confirm(buyer.agent, payment);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        orderId: payment.orderId,
        amount: 10_000,
        approvedAt: expect.any(String) as string,
        balanceAfter: 10_000,
      });
      expect(toss.calls).toEqual([payment]);
      expect(await balanceOf(buyer.agent)).toBe(10_000);
      const charged = await prisma.limeCharge.findUniqueOrThrow({
        where: { orderId: payment.orderId },
      });
      expect(charged).toMatchObject({
        status: 'APPROVED',
        paymentKey: payment.paymentKey,
      });
      expect(await prisma.limeLedger.findMany()).toEqual([
        expect.objectContaining({
          userId: buyer.user.id,
          delta: 10_000,
          kind: 'CHARGE',
          refId: charged.id,
          balanceAfter: 10_000,
        }),
      ]);
    });

    it('credits a refreshed or retried confirm once and asks Toss once', async () => {
      const payment = await ordered(5_000);
      const first = await confirm(buyer.agent, payment);
      const again = await confirm(buyer.agent, payment);
      expect(first.status).toBe(200);
      expect(again.status).toBe(200);
      expect(await balanceOf(buyer.agent)).toBe(5_000);
      expect(await ledgerCount()).toBe(1);
      expect(toss.calls).toHaveLength(1);
      expect(again.body).toEqual(first.body);
    });

    it('credits five concurrent confirms of one order once', async () => {
      const payment = await ordered(3_000);
      toss.delayMs = 300;
      const results = await Promise.all(
        Array.from({ length: 5 }, () => confirm(buyer.agent, payment)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(await balanceOf(buyer.agent)).toBe(3_000);
      expect(await ledgerCount()).toBe(1);
      expect(toss.calls).toHaveLength(1);
      for (const r of results) expect(r.body).toEqual(results[0]?.body);
    });

    it('adds concurrent confirms of different orders without losing any', async () => {
      const amounts = [1_000, 2_000, 3_000, 4_000, 5_000];
      const payments = [];
      for (const amount of amounts) payments.push(await ordered(amount));
      toss.delayMs = 100;
      const results = await Promise.all(
        payments.map((p) => confirm(buyer.agent, p)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(await balanceOf(buyer.agent)).toBe(15_000);
      expect(await ledgerCount()).toBe(5);
      const after = results
        .map((r) => (r.body as ChargeJson).balanceAfter)
        .sort((a, b) => a - b);
      expect(new Set(after).size).toBe(5);
      expect(after.at(-1)).toBe(15_000);
    });

    it('keeps each buyer’s balance apart', async () => {
      await confirm(buyer.agent, await ordered(10_000));
      await confirm(other.agent, await ordered(1_000, other.agent));
      expect(await balanceOf(buyer.agent)).toBe(10_000);
      expect(await balanceOf(other.agent)).toBe(1_000);
    });

    it('refuses someone else’s order with 403', async () => {
      const payment = await ordered(1_000);
      const res = await confirm(other.agent, payment);
      expect(res.status).toBe(403);
      expect((res.body as { message: string }).message).toBe(
        '내 충전 주문만 승인할 수 있습니다.',
      );
      expect(toss.calls).toEqual([]);
      expect(await balanceOf(other.agent)).toBe(0);
      expect(await balanceOf(buyer.agent)).toBe(0);
    });

    it('rejects an amount that differs from the order with 400', async () => {
      const payment = await ordered(1_000);
      const res = await confirm(buyer.agent, { ...payment, amount: 100_000 });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe(
        '결제 금액이 주문과 다릅니다.',
      );
      expect(toss.calls).toEqual([]);
      expect(await balanceOf(buyer.agent)).toBe(0);
    });

    it('answers 404 for an unknown order', async () => {
      const res = await confirm(buyer.agent, {
        paymentKey: 'pay_x',
        orderId: 'lime_unknown',
        amount: 1_000,
      });
      expect(res.status).toBe(404);
      expect(toss.calls).toEqual([]);
    });

    it('does not confirm a donation order as a charge', async () => {
      const res = await confirm(buyer.agent, {
        paymentKey: 'pay_x',
        orderId: 'don_00000000000000000000000000000000',
        amount: 1_000,
      });
      expect(res.status).toBe(404);
    });

    it('rejects anonymous confirms with 401', async () => {
      const payment = await ordered(1_000);
      const res = await anonymous()
        .post('/api/lime/charges/confirm')
        .send(payment);
      expect(res.status).toBe(401);
      expect(toss.calls).toEqual([]);
    });

    it('marks a Toss refusal FAILED and lets a later retry succeed', async () => {
      const payment = await ordered(1_000);
      toss.failure = new TossPaymentsError(
        400,
        'REJECT_CARD_COMPANY',
        '카드사에서 거절했습니다.',
      );
      const refused = await confirm(buyer.agent, payment);
      expect(refused.status).toBe(400);
      expect(refused.body).toEqual({
        message: '카드사에서 거절했습니다.',
        code: 'REJECT_CARD_COMPANY',
      });
      const row = await prisma.limeCharge.findUniqueOrThrow({
        where: { orderId: payment.orderId },
      });
      expect(row.status).toBe('FAILED');
      expect(await balanceOf(buyer.agent)).toBe(0);
      expect(await ledgerCount()).toBe(0);

      toss.failure = null;
      expect((await confirm(buyer.agent, payment)).status).toBe(200);
      expect(toss.calls).toHaveLength(2);
      expect(await balanceOf(buyer.agent)).toBe(1_000);
    });

    it.each([
      ['a Toss 5xx', new TossPaymentsError(500, 'FAILED_INTERNAL', '오류')],
      ['a network failure', new Error('fetch failed')],
    ])(
      'answers 502 to %s and leaves the order PENDING',
      async (_l, failure) => {
        const payment = await ordered(1_000);
        toss.failure = failure;
        expect((await confirm(buyer.agent, payment)).status).toBe(502);
        const row = await prisma.limeCharge.findUniqueOrThrow({
          where: { orderId: payment.orderId },
        });
        expect(row.status).toBe('PENDING');
        expect(await balanceOf(buyer.agent)).toBe(0);
      },
    );

    it.each([
      ['an unfinished payment', { status: 'IN_PROGRESS' }],
      ['another amount', { totalAmount: 100 }],
      ['another order', { orderId: 'lime_other' }],
      ['another payment key', { paymentKey: 'pay_other' }],
    ])('answers 502 when Toss approves %s', async (_label, change) => {
      const payment = await ordered(1_000);
      toss.tamper = (approved) => ({ ...approved, ...change });
      expect((await confirm(buyer.agent, payment)).status).toBe(502);
      expect(await balanceOf(buyer.agent)).toBe(0);
      expect(await ledgerCount()).toBe(0);
    });

    it('refuses a payment key already used for another charge', async () => {
      const first = await ordered(1_000);
      expect((await confirm(buyer.agent, first)).status).toBe(200);
      const second = await ordered(1_000);
      const res = await confirm(buyer.agent, {
        ...second,
        paymentKey: first.paymentKey,
      });
      expect(res.status).toBe(409);
      expect(await balanceOf(buyer.agent)).toBe(1_000);
      expect(await ledgerCount()).toBe(1);
    });

    it('refuses an approved order confirmed again with another payment key', async () => {
      const payment = await ordered(1_000);
      expect((await confirm(buyer.agent, payment)).status).toBe(200);
      const res = await confirm(buyer.agent, {
        ...payment,
        paymentKey: 'pay_other',
      });
      expect(res.status).toBe(409);
      expect(toss.calls).toHaveLength(1);
      expect(await balanceOf(buyer.agent)).toBe(1_000);
    });
  });

  describe('reading the balance', () => {
    it('answers 401 to anonymous callers', async () => {
      expect((await anonymous().get('/api/me/lime')).status).toBe(401);
    });

    it('starts at 0 and adds up the charges', async () => {
      expect(await balanceOf(buyer.agent)).toBe(0);
      await confirm(buyer.agent, await ordered(1_000));
      await confirm(buyer.agent, await ordered(5_000));
      await ordered(10_000);
      expect(await balanceOf(buyer.agent)).toBe(6_000);
    });
  });
});

describe('lime charges without Toss keys', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ toss: null });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 503 to orders and confirms, and still reads the balance', async () => {
    await resetDatabase(app);
    const prisma = app.get(PrismaService);
    const { agent } = await signUpAndLogIn(app);
    const ordered = await agent
      .post('/api/lime/charges')
      .send({ amount: 1000 });
    expect(ordered.status).toBe(503);
    const confirmed = await agent
      .post('/api/lime/charges/confirm')
      .send({ paymentKey: 'pay_x', orderId: 'lime_x', amount: 1000 });
    expect(confirmed.status).toBe(503);
    expect(await prisma.limeCharge.count()).toBe(0);
    const balance = await agent.get('/api/me/lime');
    expect(balance.status).toBe(200);
    expect(balance.body).toEqual({ balance: 0 });
  });
});
