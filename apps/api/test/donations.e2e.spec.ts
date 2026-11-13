import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/database.module.js';
import {
  DONATION_LIST_LIMIT,
  DONATION_MAX_AMOUNT,
  DONATION_MESSAGE_MAX_LENGTH,
  DONATION_MIN_AMOUNT,
  type DonationOrder,
} from '../src/donations/donations.service.js';
import { TossPaymentsError } from '../src/donations/toss-payments.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import {
  createTestApp,
  logIn,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';
import {
  fakeTossPaymentsOf,
  TEST_TOSS_CONFIG,
  type FakeTossPayments,
} from './support/fake-toss-payments.js';

interface DonationJson {
  id: string;
  method: 'TOSS' | 'LIME';
  amount: number;
  message: string;
  approvedAt: string;
  donor: { id: string; nickname: string };
  broadcastId?: string | null;
}

interface DonationListJson {
  total: number;
  count: number;
  donations: DonationJson[];
}

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('donations', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let toss: FakeTossPayments;
  let streamer: { user: TestUser; agent: TestAgent };
  let donor: { user: TestUser; agent: TestAgent };
  let broadcastId: string;

  const anonymous = () => request(app.getHttpServer());
  const list = async (id = broadcastId) =>
    (await anonymous().get(`/api/broadcasts/${id}/donations`))
      .body as DonationListJson;
  const order = (agent: TestAgent, body: unknown, id = broadcastId) =>
    agent.post(`/api/broadcasts/${id}/donations`).send(body as object);
  const confirm = (agent: TestAgent, body: unknown) =>
    agent.post('/api/donations/confirm').send(body as object);

  // Orders a donation and returns what the success page would post back.
  const ordered = async (amount = 1000, message = '') => {
    const res = await order(donor.agent, { amount, message });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { orderId } = res.body as DonationOrder;
    return { paymentKey: `pay_${orderId}`, orderId, amount };
  };

  const setStatus = (status: BroadcastStatus) =>
    prisma.broadcast.update({ where: { id: broadcastId }, data: { status } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    toss = fakeTossPaymentsOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    toss.reset();
    streamer = await signUpAndLogIn(app, { nickname: '불씨' });
    donor = await signUpAndLogIn(app, { nickname: '후원자' });
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

  describe('ordering', () => {
    it('hands the payment widget an order for the donor', async () => {
      const res = await order(donor.agent, {
        amount: 5000,
        message: '응원해요',
      });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        orderId: expect.stringMatching(/^don_[0-9a-f]{32}$/) as string,
        orderName: '라임 방송 후원',
        amount: 5000,
        clientKey: TEST_TOSS_CONFIG.clientKey,
        customerKey: donor.user.id,
      });
    });

    it('keeps the order name within Toss’s 100 characters', async () => {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { title: 'ㄱ'.repeat(100) },
      });
      const res = await order(donor.agent, { amount: 1000 });
      const { orderName } = res.body as DonationOrder;
      expect(orderName).toHaveLength(100);
      expect(orderName.endsWith(' 후원')).toBe(true);
    });

    it('does not count an unpaid order', async () => {
      await ordered(3000);
      expect(await list()).toEqual({ total: 0, count: 0, donations: [] });
    });

    it.each([DONATION_MIN_AMOUNT, DONATION_MAX_AMOUNT])(
      'accepts %i won',
      async (amount) => {
        expect((await order(donor.agent, { amount })).status).toBe(201);
      },
    );

    it.each([
      ['below the minimum', { amount: DONATION_MIN_AMOUNT - 1 }],
      ['above the maximum', { amount: DONATION_MAX_AMOUNT + 1 }],
      ['fractional', { amount: 1000.5 }],
      ['a string amount', { amount: '1000' }],
      ['missing amount', {}],
      [
        'too long a message',
        { amount: 1000, message: 'ㄱ'.repeat(DONATION_MESSAGE_MAX_LENGTH + 1) },
      ],
    ])('rejects %s with 400', async (_label, body) => {
      expect((await order(donor.agent, body)).status).toBe(400);
      expect(await prisma.donation.count()).toBe(0);
    });

    it('trims the message and accepts exactly the maximum length', async () => {
      const longest = 'ㄱ'.repeat(DONATION_MESSAGE_MAX_LENGTH);
      const payment = await ordered(1000, `  ${longest}  `);
      const res = await confirm(donor.agent, payment);
      expect((res.body as DonationJson).message).toBe(longest);
    });

    it.each<BroadcastStatus>(['READY', 'ENDED'])(
      'refuses an order while the broadcast is %s',
      async (status) => {
        await setStatus(status);
        const res = await order(donor.agent, { amount: 1000 });
        expect(res.status).toBe(409);
        expect((res.body as { message: string }).message).toBe(
          '방송 중일 때만 후원할 수 있습니다.',
        );
        expect(await prisma.donation.count()).toBe(0);
      },
    );

    it('refuses the streamer a donation to their own broadcast', async () => {
      const res = await order(streamer.agent, { amount: 1000 });
      expect(res.status).toBe(403);
      expect((res.body as { message: string }).message).toBe(
        '내 방송에는 후원할 수 없습니다.',
      );
      expect(await prisma.donation.count()).toBe(0);
    });

    it.each([UNKNOWN_ID, 'not-a-uuid'])(
      'answers 404 for a missing broadcast %s',
      async (id) => {
        expect((await order(donor.agent, { amount: 1000 }, id)).status).toBe(
          404,
        );
        expect(
          (await anonymous().get(`/api/broadcasts/${id}/donations`)).status,
        ).toBe(404);
      },
    );
  });

  describe('confirming', () => {
    it('credits a confirmed donation to the broadcast', async () => {
      const payment = await ordered(5000, '화이팅');
      const res = await confirm(donor.agent, payment);
      expect(res.status).toBe(200);
      const confirmed = res.body as DonationJson;
      expect(confirmed).toEqual({
        id: expect.any(String) as string,
        method: 'TOSS',
        amount: 5000,
        message: '화이팅',
        approvedAt: expect.any(String) as string,
        donor: { id: donor.user.id, nickname: '후원자' },
        broadcastId,
      });
      expect(toss.calls).toEqual([payment]);
      // toEqual treats an undefined key as absent: the list omits broadcastId.
      expect(await list()).toEqual({
        total: 5000,
        count: 1,
        donations: [{ ...confirmed, broadcastId: undefined }],
      });
    });

    it('credits a refreshed or retried confirm once and asks Toss once', async () => {
      const payment = await ordered(2000);
      const first = await confirm(donor.agent, payment);
      const again = await confirm(donor.agent, payment);
      expect(first.status).toBe(200);
      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      expect(toss.calls).toHaveLength(1);
      expect(await list()).toMatchObject({ total: 2000, count: 1 });
    });

    it('credits two concurrent confirms of one order once', async () => {
      const payment = await ordered(3000);
      const secondTab = await logIn(app, donor.user);
      toss.delayMs = 300;
      const [a, b] = await Promise.all([
        confirm(donor.agent, payment),
        confirm(secondTab, payment),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect((a.body as DonationJson).id).toBe((b.body as DonationJson).id);
      expect(toss.calls).toHaveLength(1);
      expect(await prisma.donation.count({ where: { status: 'PAID' } })).toBe(
        1,
      );
      expect(await list()).toMatchObject({ total: 3000, count: 1 });
    });

    it('rejects an amount that differs from the order', async () => {
      const payment = await ordered(1000);
      const res = await confirm(donor.agent, { ...payment, amount: 100 });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe(
        '결제 금액이 주문과 다릅니다.',
      );
      expect(toss.calls).toEqual([]);
      expect(await list()).toMatchObject({ total: 0, count: 0 });
    });

    it('refuses someone else’s order', async () => {
      const payment = await ordered(1000);
      const res = await confirm(streamer.agent, payment);
      expect(res.status).toBe(403);
      expect((res.body as { message: string }).message).toBe(
        '내 후원 주문만 승인할 수 있습니다.',
      );
      expect(toss.calls).toEqual([]);
      expect(await list()).toMatchObject({ count: 0 });
    });

    it('answers 404 for an unknown order', async () => {
      const res = await confirm(donor.agent, {
        paymentKey: 'pay_x',
        orderId: 'don_unknown',
        amount: 1000,
      });
      expect(res.status).toBe(404);
      expect(toss.calls).toEqual([]);
    });

    it('rejects anonymous confirms with 401', async () => {
      const payment = await ordered(1000);
      const res = await anonymous()
        .post('/api/donations/confirm')
        .send(payment);
      expect(res.status).toBe(401);
    });

    it('passes on a Toss refusal and lets a later retry succeed', async () => {
      const payment = await ordered(1000);
      toss.failure = new TossPaymentsError(
        400,
        'REJECT_CARD_COMPANY',
        '카드사에서 거절했습니다.',
      );
      const refused = await confirm(donor.agent, payment);
      expect(refused.status).toBe(400);
      expect(refused.body).toEqual({
        message: '카드사에서 거절했습니다.',
        code: 'REJECT_CARD_COMPANY',
      });
      expect(await list()).toMatchObject({ count: 0 });
      const row = await prisma.donation.findUniqueOrThrow({
        where: { orderId: payment.orderId },
      });
      expect(row.status).toBe('PENDING');

      toss.failure = null;
      expect((await confirm(donor.agent, payment)).status).toBe(200);
      expect(toss.calls).toHaveLength(2);
      expect(await list()).toMatchObject({ total: 1000, count: 1 });
    });

    it.each([
      ['a Toss 5xx', new TossPaymentsError(500, 'FAILED_INTERNAL', '오류')],
      ['a network failure', new Error('fetch failed')],
    ])('answers 502 to %s and credits nothing', async (_label, failure) => {
      const payment = await ordered(1000);
      toss.failure = failure;
      expect((await confirm(donor.agent, payment)).status).toBe(502);
      expect(await list()).toMatchObject({ count: 0 });
    });

    it.each([
      ['an unfinished payment', { status: 'IN_PROGRESS' }],
      ['another amount', { totalAmount: 100 }],
      ['another order', { orderId: 'don_other' }],
      ['another payment key', { paymentKey: 'pay_other' }],
    ])('answers 502 when Toss approves %s', async (_label, change) => {
      const payment = await ordered(1000);
      toss.tamper = (approved) => ({ ...approved, ...change });
      expect((await confirm(donor.agent, payment)).status).toBe(502);
      expect(await list()).toMatchObject({ total: 0, count: 0 });
      const row = await prisma.donation.findUniqueOrThrow({
        where: { orderId: payment.orderId },
      });
      expect(row.status).toBe('PENDING');
    });

    it('refuses a payment key already used for another order', async () => {
      const first = await ordered(1000);
      expect((await confirm(donor.agent, first)).status).toBe(200);
      const second = await ordered(1000);
      const res = await confirm(donor.agent, {
        ...second,
        paymentKey: first.paymentKey,
      });
      expect(res.status).toBe(409);
      expect(await list()).toMatchObject({ total: 1000, count: 1 });
    });

    it('refuses a paid order confirmed again with another payment key', async () => {
      const payment = await ordered(1000);
      expect((await confirm(donor.agent, payment)).status).toBe(200);
      const res = await confirm(donor.agent, {
        ...payment,
        paymentKey: 'pay_other',
      });
      expect(res.status).toBe(409);
      expect(toss.calls).toHaveLength(1);
    });

    it('confirms after the broadcast has ended', async () => {
      const payment = await ordered(1000);
      await setStatus('ENDED');
      expect((await confirm(donor.agent, payment)).status).toBe(200);
      expect(await list()).toMatchObject({ total: 1000, count: 1 });
    });
  });

  describe('listing', () => {
    it(`lists the latest ${DONATION_LIST_LIMIT} newest first and totals them all`, async () => {
      const start = Date.parse('2026-11-10T00:00:00.000Z');
      const extra = 3;
      await prisma.donation.createMany({
        data: Array.from({ length: DONATION_LIST_LIMIT + extra }, (_, i) => ({
          orderId: `don_seed_${i}`,
          broadcastId,
          donorId: donor.user.id,
          amount: 1000,
          message: `후원 ${i}`,
          status: 'PAID' as const,
          paymentKey: `pay_seed_${i}`,
          approvedAt: new Date(start + i * 1000),
        })),
      });
      const { total, count, donations } = await list();
      expect(total).toBe((DONATION_LIST_LIMIT + extra) * 1000);
      expect(count).toBe(DONATION_LIST_LIMIT + extra);
      expect(donations).toHaveLength(DONATION_LIST_LIMIT);
      expect(donations[0]?.message).toBe(
        `후원 ${DONATION_LIST_LIMIT + extra - 1}`,
      );
      expect(donations.at(-1)?.message).toBe(`후원 ${extra}`);
    });

    it('never reveals the donor’s email', async () => {
      await confirm(donor.agent, await ordered(1000));
      const raw = JSON.stringify(await list());
      expect(raw).not.toContain(donor.user.email);
      expect((await list()).donations[0]?.donor).toEqual({
        id: donor.user.id,
        nickname: '후원자',
      });
    });

    // #114: a donation is a record of money, so deleting the broadcast only
    // unlinks it.
    it('keeps the donations of a broadcast its streamer deletes, unlinked', async () => {
      await confirm(donor.agent, await ordered(1000));
      await ordered(2000);
      const removed = await streamer.agent.delete(
        `/api/broadcasts/${broadcastId}`,
      );
      expect(removed.status).toBe(204);
      const kept = await prisma.donation.findMany({
        orderBy: { amount: 'asc' },
      });
      expect(kept.map((d) => [d.amount, d.status, d.broadcastId])).toEqual([
        [1000, 'PAID', null],
        [2000, 'PENDING', null],
      ]);
      expect(
        (await anonymous().get(`/api/broadcasts/${broadcastId}/donations`))
          .status,
      ).toBe(404);
    });

    it('refuses to confirm an order whose broadcast was deleted, before Toss', async () => {
      const payment = await ordered(2000);
      await streamer.agent.delete(`/api/broadcasts/${broadcastId}`);
      const res = await confirm(donor.agent, payment);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        message: '방송이 삭제되어 후원할 수 없습니다.',
        code: 'BROADCAST_DELETED',
      });
      expect(toss.calls).toEqual([]);
      const row = await prisma.donation.findUniqueOrThrow({
        where: { orderId: payment.orderId },
      });
      expect(row.status).toBe('PENDING');
    });

    // Known gap, pinned so a fix shows up here: a 502 leaves the order
    // PENDING although Toss may have taken the money, and once the
    // broadcast is gone the retry is refused without asking Toss again.
    it('refuses the retry of a 502 confirm once the broadcast is deleted', async () => {
      const payment = await ordered(2000);
      toss.failure = new TossPaymentsError(500, 'FAILED_INTERNAL', '오류');
      expect((await confirm(donor.agent, payment)).status).toBe(502);
      await streamer.agent.delete(`/api/broadcasts/${broadcastId}`);
      toss.failure = null;
      const retry = await confirm(donor.agent, payment);
      expect(retry.status).toBe(409);
      expect(toss.calls).toHaveLength(1);
      expect(
        await prisma.donation.findUniqueOrThrow({
          where: { orderId: payment.orderId },
        }),
      ).toMatchObject({ status: 'PENDING', broadcastId: null });
    });

    it('still answers a paid donation confirmed again after its broadcast was deleted', async () => {
      const payment = await ordered(1000);
      const first = await confirm(donor.agent, payment);
      expect(first.status).toBe(200);
      await streamer.agent.delete(`/api/broadcasts/${broadcastId}`);
      const again = await confirm(donor.agent, payment);
      expect(again.status).toBe(200);
      expect(again.body).toEqual({
        ...(first.body as DonationJson),
        broadcastId: null,
      });
      expect(toss.calls).toHaveLength(1);
    });
  });
});

describe('donations without Toss keys', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ toss: null });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 503 to orders and confirms, and still lists', async () => {
    await resetDatabase(app);
    const prisma = app.get(PrismaService);
    const streamer = await signUpAndLogIn(app);
    const donor = await signUpAndLogIn(app);
    const broadcast = await prisma.broadcast.create({
      data: {
        streamerId: streamer.user.id,
        title: '방송',
        status: 'LIVE',
        startedAt: new Date(),
      },
    });
    const url = `/api/broadcasts/${broadcast.id}/donations`;
    const ordered = await donor.agent.post(url).send({ amount: 1000 });
    expect(ordered.status).toBe(503);
    expect((ordered.body as { message: string }).message).toBe(
      '후원 기능이 설정되지 않았습니다.',
    );
    const confirmed = await donor.agent
      .post('/api/donations/confirm')
      .send({ paymentKey: 'pay_x', orderId: 'don_x', amount: 1000 });
    expect(confirmed.status).toBe(503);
    expect(await prisma.donation.count()).toBe(0);
    const listed = await request(app.getHttpServer()).get(url);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ total: 0, count: 0, donations: [] });
  });
});
