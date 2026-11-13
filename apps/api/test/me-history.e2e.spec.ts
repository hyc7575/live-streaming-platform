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
import type { DonationOrder } from '../src/donations/donations.service.js';
import type { LimeChargeOrder } from '../src/lime/lime.service.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';
import { expectLedgerMatchesBalances } from './support/lime.js';

interface TargetJson {
  broadcast: { id: string; title: string } | null;
  recipient: { id: string; nickname: string } | null;
}

interface LedgerEntryJson {
  id: string;
  kind: 'CHARGE' | 'DONATION';
  delta: number;
  balanceAfter: number;
  createdAt: string;
  donation: TargetJson | null;
}

interface SentDonationJson extends TargetJson {
  id: string;
  method: 'TOSS' | 'LIME';
  amount: number;
  message: string;
  approvedAt: string;
}

interface SentListJson {
  total: number;
  count: number;
  donations: SentDonationJson[];
}

interface ReceivedListJson {
  total: number;
  count: number;
  donations: (Omit<SentDonationJson, 'recipient'> & {
    donor: { id: string; nickname: string };
  })[];
}

interface FollowerListJson {
  count: number;
  followers: { id: string; nickname: string; followedAt: string }[];
}

// PRD-mypage 7.2: the caller's own lime ledger, sent donations and
// followers. The paths hold no user id, so the only refusal is 401, and a
// caller never sees another user's rows.
describe('my history', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let streamer: { user: TestUser; agent: TestAgent };
  let viewer: { user: TestUser; agent: TestAgent };
  let other: { user: TestUser; agent: TestAgent };

  const anonymous = () => request(app.getHttpServer());

  async function getOk<T>(agent: TestAgent, path: string): Promise<T> {
    const res = await agent.get(path);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as T;
  }
  const ledger = (agent: TestAgent) =>
    getOk<LedgerEntryJson[]>(agent, '/api/me/lime/ledger');
  const sent = (agent: TestAgent) =>
    getOk<SentListJson>(agent, '/api/me/donations');
  const received = (agent: TestAgent) =>
    getOk<ReceivedListJson>(agent, '/api/me/received-donations');
  const followers = (agent: TestAgent) =>
    getOk<FollowerListJson>(agent, '/api/me/followers');
  const balance = async (agent: TestAgent) =>
    (await getOk<{ balance: number }>(agent, '/api/me/lime')).balance;

  const goLive = async (streamerId: string, title: string) =>
    (
      await prisma.broadcast.create({
        data: { streamerId, title, status: 'LIVE', startedAt: new Date() },
      })
    ).id;

  const charge = async (agent: TestAgent, amount: number) => {
    const ordered = await agent.post('/api/lime/charges').send({ amount });
    expect(ordered.status, JSON.stringify(ordered.body)).toBe(201);
    const { orderId } = ordered.body as LimeChargeOrder;
    const confirmed = await agent
      .post('/api/lime/charges/confirm')
      .send({ paymentKey: `pay_${orderId}`, orderId, amount });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  };

  const donateLime = async (
    agent: TestAgent,
    broadcastId: string,
    amount: number,
  ) => {
    const res = await agent
      .post(`/api/broadcasts/${broadcastId}/lime-donations`)
      .send({ amount, message: '', orderId: randomUUID() });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  };

  // Orders and, unless `pay` is false, confirms a card donation.
  const donateCard = async (
    agent: TestAgent,
    broadcastId: string,
    amount: number,
    pay = true,
  ) => {
    const ordered = await agent
      .post(`/api/broadcasts/${broadcastId}/donations`)
      .send({ amount, message: '카드' });
    expect(ordered.status, JSON.stringify(ordered.body)).toBe(201);
    if (!pay) return;
    const { orderId } = ordered.body as DonationOrder;
    const confirmed = await agent
      .post('/api/donations/confirm')
      .send({ paymentKey: `pay_${orderId}`, orderId, amount });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    streamer = await signUpAndLogIn(app, { nickname: '불씨' });
    viewer = await signUpAndLogIn(app, { nickname: '구경꾼' });
    other = await signUpAndLogIn(app, { nickname: '다른사람' });
  });

  afterEach(async () => {
    await expectLedgerMatchesBalances(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    '/api/me/lime/ledger',
    '/api/me/donations',
    '/api/me/received-donations',
    '/api/me/followers',
  ])('refuses %s without a login', async (path) => {
    expect((await anonymous().get(path)).status).toBe(401);
  });

  it('lists the ledger newest first, ending at the current balance', async () => {
    const broadcastId = await goLive(streamer.user.id, '라임 방송');
    await charge(viewer.agent, 10_000);
    await donateLime(viewer.agent, broadcastId, 3_000);
    await charge(other.agent, 5_000);

    const entries = await ledger(viewer.agent);
    expect(entries).toEqual([
      expect.objectContaining({
        kind: 'DONATION',
        delta: -3_000,
        balanceAfter: 7_000,
        donation: {
          broadcast: { id: broadcastId, title: '라임 방송' },
          recipient: { id: streamer.user.id, nickname: '불씨' },
        },
      }),
      expect.objectContaining({
        kind: 'CHARGE',
        delta: 10_000,
        balanceAfter: 10_000,
        donation: null,
      }),
    ]);
    // KR5: the newest row's balance is the balance the API reports.
    expect(entries[0]?.balanceAfter).toBe(await balance(viewer.agent));
    expect(await ledger(other.agent)).toEqual([
      expect.objectContaining({ kind: 'CHARGE', balanceAfter: 5_000 }),
    ]);
    expect(await ledger(streamer.agent)).toEqual([]);
  });

  it('lists sent donations of both methods, unpaid orders left out', async () => {
    const first = await goLive(streamer.user.id, '첫 방송');
    const second = await goLive(other.user.id, '다른 방송');
    await charge(viewer.agent, 10_000);
    await donateLime(viewer.agent, first, 2_000);
    await donateCard(viewer.agent, second, 5_000);
    await donateCard(viewer.agent, second, 1_000, false);
    await donateCard(other.agent, first, 4_000);

    const list = await sent(viewer.agent);
    expect(list.total).toBe(7_000);
    expect(list.count).toBe(2);
    expect(list.donations).toEqual([
      expect.objectContaining({
        method: 'TOSS',
        amount: 5_000,
        message: '카드',
        broadcast: { id: second, title: '다른 방송' },
        recipient: { id: other.user.id, nickname: '다른사람' },
      }),
      expect.objectContaining({
        method: 'LIME',
        amount: 2_000,
        broadcast: { id: first, title: '첫 방송' },
        recipient: { id: streamer.user.id, nickname: '불씨' },
      }),
    ]);
    expect(list.donations[0]).not.toHaveProperty('donor');
    expect(await sent(streamer.agent)).toEqual({
      total: 0,
      count: 0,
      donations: [],
    });
  });

  // #114: deleting the broadcast keeps the donation and its ledger row, and
  // the donation still names its streamer.
  it('keeps a donation whose broadcast was deleted, without the broadcast', async () => {
    const broadcastId = await goLive(streamer.user.id, '지울 방송');
    await charge(viewer.agent, 10_000);
    await donateLime(viewer.agent, broadcastId, 3_000);
    await donateCard(viewer.agent, broadcastId, 1_000);

    const deleted = await streamer.agent.delete(
      `/api/broadcasts/${broadcastId}`,
    );
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);

    const list = await sent(viewer.agent);
    expect(list).toMatchObject({ total: 4_000, count: 2 });
    const recipient = { id: streamer.user.id, nickname: '불씨' };
    for (const donation of list.donations) {
      expect(donation).toMatchObject({ broadcast: null, recipient });
    }
    const [donation] = await ledger(viewer.agent);
    expect(donation).toMatchObject({
      kind: 'DONATION',
      donation: { broadcast: null, recipient },
    });
  });

  it('totals what a streamer received across broadcasts, only their own', async () => {
    const first = await goLive(streamer.user.id, '첫 방송');
    await charge(viewer.agent, 10_000);
    await donateLime(viewer.agent, first, 2_000);
    await donateCard(other.agent, first, 5_000);
    await donateCard(other.agent, first, 1_000, false);
    await prisma.broadcast.update({
      where: { id: first },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    const second = await goLive(streamer.user.id, '둘째 방송');
    await donateCard(viewer.agent, second, 3_000);
    const elsewhere = await goLive(other.user.id, '다른 방송');
    await donateLime(viewer.agent, elsewhere, 4_000);

    const list = await received(streamer.agent);
    expect(list).toMatchObject({ total: 10_000, count: 3 });
    expect(list.donations).toEqual([
      expect.objectContaining({
        method: 'TOSS',
        amount: 3_000,
        donor: { id: viewer.user.id, nickname: '구경꾼' },
        broadcast: { id: second, title: '둘째 방송' },
      }),
      expect.objectContaining({
        method: 'TOSS',
        amount: 5_000,
        donor: { id: other.user.id, nickname: '다른사람' },
        broadcast: { id: first, title: '첫 방송' },
      }),
      expect.objectContaining({
        method: 'LIME',
        amount: 2_000,
        donor: { id: viewer.user.id, nickname: '구경꾼' },
        broadcast: { id: first, title: '첫 방송' },
      }),
    ]);
    expect(await received(other.agent)).toMatchObject({
      total: 4_000,
      count: 1,
    });
    expect(await received(viewer.agent)).toEqual({
      total: 0,
      count: 0,
      donations: [],
    });
  });

  // PRD-mypage KR4: the total is the same before and after the deletion.
  it('keeps a streamer’s received total when a broadcast is deleted', async () => {
    const broadcastId = await goLive(streamer.user.id, '지울 방송');
    await charge(viewer.agent, 10_000);
    await donateLime(viewer.agent, broadcastId, 3_000);
    await donateCard(other.agent, broadcastId, 2_000);
    const before = await received(streamer.agent);
    expect(before).toMatchObject({ total: 5_000, count: 2 });

    const deleted = await streamer.agent.delete(
      `/api/broadcasts/${broadcastId}`,
    );
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);

    const after = await received(streamer.agent);
    expect(after).toMatchObject({ total: 5_000, count: 2 });
    expect(after.donations.map((d) => d.id)).toEqual(
      before.donations.map((d) => d.id),
    );
    for (const donation of after.donations) {
      expect(donation.broadcast).toBeNull();
    }
  });

  it('lists only the caller’s own followers, newest first', async () => {
    const follow = async (agent: TestAgent, streamerId: string) => {
      const res = await agent.put(`/api/streamers/${streamerId}/follow`);
      expect(res.status).toBe(204);
    };
    await follow(viewer.agent, streamer.user.id);
    await follow(other.agent, streamer.user.id);
    await follow(streamer.agent, other.user.id);

    const mine = await followers(streamer.agent);
    expect(mine.count).toBe(2);
    expect(mine.followers.map((f) => f.nickname)).toEqual([
      '다른사람',
      '구경꾼',
    ]);
    expect(await followers(other.agent)).toEqual({
      count: 1,
      followers: [
        {
          id: streamer.user.id,
          nickname: '불씨',
          followedAt: expect.any(String) as string,
        },
      ],
    });
    expect(await followers(viewer.agent)).toEqual({
      count: 0,
      followers: [],
    });
  });
});
