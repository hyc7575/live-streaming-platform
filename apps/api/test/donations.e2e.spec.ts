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

interface RankingJson {
  donor: { id: string; nickname: string };
  total: number;
}

interface DonationListJson {
  total: number;
  count: number;
  donations: DonationJson[];
  ranking: RankingJson[];
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

  // 후원을 주문하고, 성공 페이지가 다시 보낼 값을 돌려준다.
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
      expect(await list()).toEqual({
        total: 0,
        count: 0,
        donations: [],
        ranking: [],
      });
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
      // toEqual은 값이 undefined인 키를 없는 것으로 본다. 목록은 broadcastId를 빼고 보낸다.
      expect(await list()).toEqual({
        total: 5000,
        count: 1,
        donations: [{ ...confirmed, broadcastId: undefined }],
        ranking: [{ donor: confirmed.donor, total: 5000 }],
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

    // #114: 후원은 돈의 기록이라, 방송을 지우면
    // 연결만 끊는다.
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

    // 알려진 결함. 고쳐지면 여기서 드러나도록 고정해 둔다. 502가 나면 주문은
    // Toss가 돈을 가져갔을 수도 있는데 PENDING으로 남고, 방송이
    // 사라진 뒤에는 재시도가 Toss에 다시 묻지 않고 거부된다.
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

  // S12(#163): 순위는 최근 50건이 아니라 이 방송의 PAID 후원 전부로 센다.
  describe('ranking', () => {
    const start = Date.parse('2026-11-10T00:00:00.000Z');
    let seq = 0;

    // 승인 시각 순서를 테스트가 정하도록 행을 직접 넣는다.
    const seed = (
      donorId: string,
      amount: number,
      {
        method = 'TOSS',
        status = 'PAID',
        at = seq,
        id = broadcastId,
      }: {
        method?: 'TOSS' | 'LIME';
        status?: 'PAID' | 'PENDING';
        at?: number;
        id?: string;
      } = {},
    ) => {
      seq += 1;
      return prisma.donation.create({
        data: {
          orderId: `don_rank_${seq}`,
          broadcastId: id,
          donorId,
          amount,
          method,
          status,
          paymentKey: method === 'TOSS' ? `pay_rank_${seq}` : null,
          approvedAt: status === 'PAID' ? new Date(start + at * 1000) : null,
        },
      });
    };

    it('ranks donors by their card and lime donations added together', async () => {
      const other = await signUpAndLogIn(app, { nickname: '큰손' });
      await seed(donor.user.id, 3000);
      await seed(other.user.id, 1000);
      await seed(other.user.id, 4000, { method: 'LIME' });
      await seed(donor.user.id, 1000, { method: 'LIME' });

      expect((await list()).ranking).toEqual([
        { donor: { id: other.user.id, nickname: '큰손' }, total: 5000 },
        { donor: { id: donor.user.id, nickname: '후원자' }, total: 4000 },
      ]);
    });

    it('puts the donor who gave first above a tie', async () => {
      const late = await signUpAndLogIn(app, { nickname: '나중' });
      const early = await signUpAndLogIn(app, { nickname: '먼저' });
      // 늦게 시작한 사람이 마지막 후원은 먼저 했어도, 첫 후원으로 가린다.
      await seed(late.user.id, 1000, { at: 20 });
      await seed(early.user.id, 1000, { at: 10 });
      await seed(early.user.id, 1000, { at: 40 });
      await seed(late.user.id, 1000, { at: 30 });

      expect((await list()).ranking.map((rank) => rank.donor.nickname)).toEqual(
        ['먼저', '나중'],
      );
    });

    it('counts donations older than the latest list', async () => {
      const old = await signUpAndLogIn(app, { nickname: '옛 후원자' });
      await seed(old.user.id, 10_000, { at: 0 });
      await prisma.donation.createMany({
        data: Array.from({ length: DONATION_LIST_LIMIT }, (_, i) => ({
          orderId: `don_recent_${i}`,
          broadcastId,
          donorId: donor.user.id,
          amount: 1000,
          status: 'PAID' as const,
          paymentKey: `pay_recent_${i}`,
          approvedAt: new Date(start + (100 + i) * 1000),
        })),
      });

      const { donations, ranking } = await list();
      expect(donations.map((d) => d.donor.id)).not.toContain(old.user.id);
      expect(ranking).toEqual([
        {
          donor: { id: donor.user.id, nickname: '후원자' },
          total: DONATION_LIST_LIMIT * 1000,
        },
        { donor: { id: old.user.id, nickname: '옛 후원자' }, total: 10_000 },
      ]);
    });

    it('skips unpaid orders and donations to other broadcasts', async () => {
      const elsewhere = await prisma.broadcast.create({
        data: { streamerId: streamer.user.id, title: '다른 방송' },
      });
      const other = await signUpAndLogIn(app, { nickname: '다른 시청자' });
      await seed(donor.user.id, 1000);
      await seed(donor.user.id, 50_000, { status: 'PENDING' });
      await seed(other.user.id, 50_000, { id: elsewhere.id });

      expect((await list()).ranking).toEqual([
        { donor: { id: donor.user.id, nickname: '후원자' }, total: 1000 },
      ]);
    });

    it(`lists up to ${DONATION_LIST_LIMIT} donors`, async () => {
      // 가입 API를 51번 부르지 않고 사용자 행을 바로 넣는다.
      const fans = Array.from({ length: DONATION_LIST_LIMIT + 1 }, (_, i) => ({
        email: `fan${i}@example.com`,
        nickname: `팬${i}`,
        passwordHash: 'unused',
      }));
      await prisma.user.createMany({ data: fans });
      const rows = await prisma.user.findMany({
        where: { email: { in: fans.map((fan) => fan.email) } },
        select: { id: true, nickname: true },
      });
      for (const row of rows) {
        await seed(row.id, 1000 * (Number(row.nickname.slice(1)) + 1));
      }

      const { ranking } = await list();
      expect(ranking).toHaveLength(DONATION_LIST_LIMIT);
      expect(ranking[0]?.donor.nickname).toBe(`팬${DONATION_LIST_LIMIT}`);
      expect(ranking.map((rank) => rank.donor.nickname)).not.toContain('팬0');
    });

    it('is empty without paid donations', async () => {
      await seed(donor.user.id, 1000, { status: 'PENDING' });
      expect((await list()).ranking).toEqual([]);
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
    expect(listed.body).toEqual({
      total: 0,
      count: 0,
      donations: [],
      ranking: [],
    });
  });
});
