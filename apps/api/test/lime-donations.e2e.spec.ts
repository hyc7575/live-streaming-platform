import { randomUUID } from 'node:crypto';
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
import {
  DONATION_MAX_AMOUNT,
  DONATION_MESSAGE_MAX_LENGTH,
  DONATION_MIN_AMOUNT,
  type DonationOrder,
} from '../src/donations/donations.service.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import type { LimeChargeOrder } from '../src/lime/lime.service.js';
import {
  createTestApp,
  logIn,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';
import { expectLedgerMatchesBalances } from './support/lime.js';

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
const INSUFFICIENT = '라임이 부족합니다.';
const KEY_TAKEN = '이미 다른 후원에 쓰인 요청입니다.';

// PRD-lime 7.3·§8.4: a lime donation spends the donor's balance in one
// transaction, once per idempotency key.
describe('lime donations', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let streamer: { user: TestUser; agent: TestAgent };
  let donor: { user: TestUser; agent: TestAgent };
  let other: { user: TestUser; agent: TestAgent };
  let broadcastId: string;

  const anonymous = () => request(app.getHttpServer());
  const donate = (agent: TestAgent, body: unknown, id = broadcastId) =>
    agent.post(`/api/broadcasts/${id}/lime-donations`).send(body as object);
  const attempt = (amount: number, message = '') => ({
    amount,
    message,
    orderId: randomUUID(),
  });
  const list = async (id = broadcastId) =>
    (await anonymous().get(`/api/broadcasts/${id}/donations`))
      .body as DonationListJson;
  const balanceOf = async (agent: TestAgent) => {
    const res = await agent.get('/api/me/lime');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body as { balance: number }).balance;
  };
  const messageOf = (res: { body: unknown }) =>
    (res.body as { message: string }).message;

  // Charges through the real charge API (fake Toss), so the ledger has the
  // CHARGE row a real balance would.
  const charge = async (agent: TestAgent, amount: number) => {
    const ordered = await agent.post('/api/lime/charges').send({ amount });
    expect(ordered.status, JSON.stringify(ordered.body)).toBe(201);
    const { orderId } = ordered.body as LimeChargeOrder;
    const confirmed = await agent
      .post('/api/lime/charges/confirm')
      .send({ paymentKey: `pay_${orderId}`, orderId, amount });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  };

  const setStatus = (status: BroadcastStatus) =>
    prisma.broadcast.update({ where: { id: broadcastId }, data: { status } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    streamer = await signUpAndLogIn(app, { nickname: '불씨' });
    donor = await signUpAndLogIn(app, { nickname: '후원자' });
    other = await signUpAndLogIn(app, { nickname: '다른사람' });
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

  afterEach(async () => {
    await expectLedgerMatchesBalances(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('donating', () => {
    it('debits the balance, records the donation and its ledger row', async () => {
      await charge(donor.agent, 10_000);
      const res = await donate(donor.agent, attempt(3_000, '  응원해요  '));
      expect(res.status).toBe(201);
      const donation = res.body as DonationJson;
      expect(donation).toEqual({
        id: expect.any(String) as string,
        method: 'LIME',
        amount: 3_000,
        message: '응원해요',
        approvedAt: expect.any(String) as string,
        donor: { id: donor.user.id, nickname: '후원자' },
        broadcastId,
      });
      expect(await balanceOf(donor.agent)).toBe(7_000);
      expect(
        await prisma.limeLedger.findFirst({ where: { kind: 'DONATION' } }),
      ).toMatchObject({
        userId: donor.user.id,
        delta: -3_000,
        refId: donation.id,
        balanceAfter: 7_000,
      });
      expect(await list()).toEqual({
        total: 3_000,
        count: 1,
        donations: [{ ...donation, broadcastId: undefined }],
      });
    });

    it('lists card and lime donations together with their method', async () => {
      const ordered = await donor.agent
        .post(`/api/broadcasts/${broadcastId}/donations`)
        .send({ amount: 5_000 });
      const { orderId } = ordered.body as DonationOrder;
      const card = await donor.agent
        .post('/api/donations/confirm')
        .send({ paymentKey: `pay_${orderId}`, orderId, amount: 5_000 });
      expect(card.status).toBe(200);
      expect((card.body as DonationJson).method).toBe('TOSS');

      await charge(donor.agent, 10_000);
      expect((await donate(donor.agent, attempt(3_000))).status).toBe(201);

      const { total, count, donations } = await list();
      expect({ total, count }).toEqual({ total: 8_000, count: 2 });
      expect(donations.map((d) => [d.method, d.amount])).toEqual([
        ['LIME', 3_000],
        ['TOSS', 5_000],
      ]);
    });

    it('spends the balance down to exactly 0', async () => {
      await charge(donor.agent, 3_000);
      expect((await donate(donor.agent, attempt(3_000))).status).toBe(201);
      expect(await balanceOf(donor.agent)).toBe(0);
    });

    it('refuses more than the balance with 409 and writes nothing', async () => {
      await charge(donor.agent, 2_000);
      const res = await donate(donor.agent, attempt(3_000));
      expect(res.status).toBe(409);
      expect(messageOf(res)).toBe(INSUFFICIENT);
      expect(await balanceOf(donor.agent)).toBe(2_000);
      expect(await prisma.donation.count()).toBe(0);
      expect(
        await prisma.limeLedger.count({ where: { kind: 'DONATION' } }),
      ).toBe(0);
    });

    // Acceptance: 5 concurrent 3,000 donations from a 5,000 balance.
    it('lets one of five concurrent donations through and refuses the rest', async () => {
      await charge(donor.agent, 5_000);
      const tabs = [donor.agent];
      for (let i = 1; i < 5; i += 1) tabs.push(await logIn(app, donor.user));
      const results = await Promise.all(
        tabs.map((tab) => donate(tab, attempt(3_000))),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      for (const r of results.filter((r) => r.status === 409)) {
        expect(messageOf(r)).toBe(INSUFFICIENT);
      }
      expect(await balanceOf(donor.agent)).toBe(2_000);
      expect(await prisma.donation.count()).toBe(1);
      expect(await list()).toMatchObject({ total: 3_000, count: 1 });
    });
  });

  describe('resending a key', () => {
    // Acceptance: the same orderId twice is one donation, debited once.
    it('returns the first donation with 200 and debits once', async () => {
      await charge(donor.agent, 10_000);
      const body = attempt(3_000, '한 번만');
      const first = await donate(donor.agent, body);
      const again = await donate(donor.agent, body);
      expect(first.status).toBe(201);
      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      expect(await balanceOf(donor.agent)).toBe(7_000);
      expect(await prisma.donation.count()).toBe(1);
    });

    it('makes one donation of the same key sent five times at once', async () => {
      await charge(donor.agent, 10_000);
      const body = attempt(1_000);
      const tabs = [donor.agent];
      for (let i = 1; i < 5; i += 1) tabs.push(await logIn(app, donor.user));
      const results = await Promise.all(tabs.map((tab) => donate(tab, body)));
      expect(results.map((r) => r.status).sort()).toEqual([
        200, 200, 200, 200, 201,
      ]);
      for (const r of results) expect(r.body).toEqual(results[0]?.body);
      expect(await balanceOf(donor.agent)).toBe(9_000);
      expect(await prisma.donation.count()).toBe(1);
    });

    // The response was lost after the donation spent the last lime: the
    // resend must not read as "not enough lime".
    it('returns the donation even after it spent the whole balance', async () => {
      await charge(donor.agent, 3_000);
      const body = attempt(3_000);
      expect((await donate(donor.agent, body)).status).toBe(201);
      const again = await donate(donor.agent, body);
      expect(again.status).toBe(200);
      expect(await balanceOf(donor.agent)).toBe(0);
    });

    // The response was lost and the streamer ended the broadcast before the
    // resend: the key still answers with the donation it made, not with
    // "방송 중일 때만 후원할 수 있습니다."
    it.each<BroadcastStatus>(['ENDED', 'READY'])(
      'returns the donation to a resend after the broadcast became %s',
      async (status) => {
        await charge(donor.agent, 10_000);
        const body = attempt(3_000);
        const first = await donate(donor.agent, body);
        expect(first.status).toBe(201);
        await setStatus(status);
        const again = await donate(donor.agent, body);
        expect(again.status).toBe(200);
        expect(again.body).toEqual(first.body);
        expect(await balanceOf(donor.agent)).toBe(7_000);
        expect(await prisma.donation.count()).toBe(1);
      },
    );

    it('refuses another user’s resend of the key after the broadcast ended', async () => {
      await charge(donor.agent, 10_000);
      const body = attempt(3_000);
      expect((await donate(donor.agent, body)).status).toBe(201);
      await setStatus('ENDED');
      const res = await donate(other.agent, body);
      expect(res.status).toBe(409);
      expect(messageOf(res)).toBe(KEY_TAKEN);
    });

    // A deleted broadcast takes its donations with it, so the key has
    // nothing to return and the broadcast is simply gone.
    it('answers 404 to a resend after the broadcast was deleted', async () => {
      await charge(donor.agent, 10_000);
      const body = attempt(3_000);
      expect((await donate(donor.agent, body)).status).toBe(201);
      await prisma.broadcast.delete({ where: { id: broadcastId } });
      expect((await donate(donor.agent, body)).status).toBe(404);
      expect(await balanceOf(donor.agent)).toBe(7_000);
    });

    // Acceptance: another user sending the same orderId is 409.
    it('refuses the key to another user with 409', async () => {
      await charge(donor.agent, 10_000);
      await charge(other.agent, 10_000);
      const body = attempt(3_000);
      expect((await donate(donor.agent, body)).status).toBe(201);
      const res = await donate(other.agent, body);
      expect(res.status).toBe(409);
      expect(messageOf(res)).toBe(KEY_TAKEN);
      expect(await balanceOf(other.agent)).toBe(10_000);
      expect(await balanceOf(donor.agent)).toBe(7_000);
      expect(await prisma.donation.count()).toBe(1);
    });

    it('refuses the key to another user who has no lime with 409', async () => {
      await charge(donor.agent, 10_000);
      const body = attempt(3_000);
      expect((await donate(donor.agent, body)).status).toBe(201);
      const res = await donate(other.agent, body);
      expect(res.status).toBe(409);
      expect(messageOf(res)).toBe(KEY_TAKEN);
    });

    it.each([
      ['another amount', { amount: 1_000 }],
      ['another broadcast', 'other-broadcast'],
    ] as const)('refuses the key for %s with 409', async (_label, change) => {
      await charge(donor.agent, 10_000);
      const body = attempt(3_000);
      expect((await donate(donor.agent, body)).status).toBe(201);
      let res;
      if (change === 'other-broadcast') {
        const second = await prisma.broadcast.create({
          data: {
            streamerId: other.user.id,
            title: '두 번째 방송',
            status: 'LIVE',
            startedAt: new Date(),
          },
        });
        res = await donate(donor.agent, body, second.id);
      } else {
        res = await donate(donor.agent, { ...body, ...change });
      }
      expect(res.status).toBe(409);
      expect(messageOf(res)).toBe(KEY_TAKEN);
      expect(await balanceOf(donor.agent)).toBe(7_000);
      expect(await prisma.donation.count()).toBe(1);
    });

    it('refuses a key a card order already holds with 409', async () => {
      await charge(donor.agent, 10_000);
      const body = attempt(3_000);
      await prisma.donation.create({
        data: {
          orderId: body.orderId,
          broadcastId,
          donorId: donor.user.id,
          amount: 3_000,
          method: 'TOSS',
        },
      });
      const res = await donate(donor.agent, body);
      expect(res.status).toBe(409);
      expect(messageOf(res)).toBe(KEY_TAKEN);
      expect(await balanceOf(donor.agent)).toBe(10_000);
    });
  });

  describe('target and body', () => {
    // Acceptance: 401 anonymous, 403 own broadcast, 409 READY and ENDED.
    it('answers 401 to anonymous callers', async () => {
      const res = await anonymous()
        .post(`/api/broadcasts/${broadcastId}/lime-donations`)
        .send(attempt(1_000));
      expect(res.status).toBe(401);
    });

    it('refuses the streamer a donation to their own broadcast with 403', async () => {
      await charge(streamer.agent, 10_000);
      const res = await donate(streamer.agent, attempt(1_000));
      expect(res.status).toBe(403);
      expect(messageOf(res)).toBe('내 방송에는 후원할 수 없습니다.');
      expect(await balanceOf(streamer.agent)).toBe(10_000);
    });

    it.each<BroadcastStatus>(['READY', 'ENDED'])(
      'refuses a donation while the broadcast is %s with 409',
      async (status) => {
        await charge(donor.agent, 10_000);
        await setStatus(status);
        const res = await donate(donor.agent, attempt(1_000));
        expect(res.status).toBe(409);
        expect(messageOf(res)).toBe('방송 중일 때만 후원할 수 있습니다.');
        expect(await balanceOf(donor.agent)).toBe(10_000);
      },
    );

    it.each([UNKNOWN_ID, 'not-a-uuid'])(
      'answers 404 for a missing broadcast %s',
      async (id) => {
        expect((await donate(donor.agent, attempt(1_000), id)).status).toBe(
          404,
        );
      },
    );

    it.each([DONATION_MIN_AMOUNT, DONATION_MAX_AMOUNT])(
      'accepts %i lime',
      async (amount) => {
        await charge(donor.agent, DONATION_MAX_AMOUNT);
        expect((await donate(donor.agent, attempt(amount))).status).toBe(201);
      },
    );

    it.each([
      ['below the minimum', { amount: DONATION_MIN_AMOUNT - 1 }],
      ['above the maximum', { amount: DONATION_MAX_AMOUNT + 1 }],
      ['fractional', { amount: 1000.5 }],
      ['a string amount', { amount: '1000' }],
      [
        'too long a message',
        { message: 'ㄱ'.repeat(DONATION_MESSAGE_MAX_LENGTH + 1) },
      ],
      ['a missing key', { orderId: undefined }],
      ['a key that is not a UUID', { orderId: 'don_123456' }],
    ])('rejects %s with 400', async (_label, change) => {
      await charge(donor.agent, 10_000);
      const res = await donate(donor.agent, { ...attempt(1_000), ...change });
      expect(res.status).toBe(400);
      expect(await prisma.donation.count()).toBe(0);
    });

    // PRD-lime 7.3: 401 → 400 → 404 → 403 → 409 not LIVE → 409 short of lime.
    // Unlike a card order, the body comes before the broadcast.
    it('checks login, body, broadcast, streamer, status, then balance', async () => {
      const bad = { amount: 1 };
      const good = attempt(1_000);
      const url = `/api/broadcasts/${broadcastId}/lime-donations`;
      expect((await anonymous().post(url).send(bad)).status).toBe(401);
      expect((await donate(donor.agent, bad, UNKNOWN_ID)).status).toBe(400);
      expect((await donate(streamer.agent, bad)).status).toBe(400);
      expect((await donate(donor.agent, good, UNKNOWN_ID)).status).toBe(404);
      await setStatus('READY');
      expect((await donate(streamer.agent, good)).status).toBe(403);
      const notLive = await donate(donor.agent, good);
      expect(notLive.status).toBe(409);
      expect(messageOf(notLive)).toBe('방송 중일 때만 후원할 수 있습니다.');
      await setStatus('LIVE');
      const short = await donate(donor.agent, good);
      expect(short.status).toBe(409);
      expect(messageOf(short)).toBe(INSUFFICIENT);
    });

    // #114: the donation is the only record of where the lime went, so
    // deleting the broadcast unlinks it instead of deleting it. afterEach
    // checks that its ledger row still resolves.
    it('keeps lime donations of a deleted broadcast, unlinked', async () => {
      await charge(donor.agent, 10_000);
      const donated = await donate(donor.agent, attempt(3_000));
      expect(donated.status).toBe(201);
      const removed = await streamer.agent.delete(
        `/api/broadcasts/${broadcastId}`,
      );
      expect(removed.status).toBe(204);
      expect(
        await prisma.donation.findUniqueOrThrow({
          where: { id: (donated.body as DonationJson).id },
        }),
      ).toMatchObject({
        broadcastId: null,
        method: 'LIME',
        status: 'PAID',
        amount: 3_000,
        donorId: donor.user.id,
      });
      expect(await balanceOf(donor.agent)).toBe(7_000);
      expect(
        (await anonymous().get(`/api/broadcasts/${broadcastId}/donations`))
          .status,
      ).toBe(404);
    });
  });
});
