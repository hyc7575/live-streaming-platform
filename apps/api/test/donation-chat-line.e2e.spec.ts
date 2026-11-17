import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/database.module.js';
import type { DonationOrder } from '../src/donations/donations.service.js';
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

// HTTP로 받은 채팅 메시지. 후원 줄이면 `donation`이 있다.
interface ChatJson {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; nickname: string };
  donation: { amount: number; method: 'TOSS' | 'LIME' } | null;
}

// #166: 후원이 PAID가 되는 트랜잭션이 채팅에 후원 줄을 남긴다.
describe('donation chat lines', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let toss: FakeTossPayments;
  let streamer: { user: TestUser; agent: TestAgent };
  let donor: { user: TestUser; agent: TestAgent };
  let viewer: { user: TestUser; agent: TestAgent };
  let broadcastId: string;

  const anonymous = () => request(app.getHttpServer());
  const chat = async (after?: string) =>
    (
      await anonymous()
        .get(`/api/broadcasts/${broadcastId}/chat`)
        .query(after === undefined ? {} : { after })
    ).body as ChatJson[];
  const say = async (agent: TestAgent, body: string) => {
    const res = await agent
      .post(`/api/broadcasts/${broadcastId}/chat`)
      .send({ body });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as ChatJson;
  };
  const confirm = (agent: TestAgent, body: unknown) =>
    agent.post('/api/donations/confirm').send(body as object);

  // 카드 후원을 주문하고, 성공 페이지가 보낼 값을 돌려준다.
  const ordered = async (amount: number, message: string) => {
    const res = await donor.agent
      .post(`/api/broadcasts/${broadcastId}/donations`)
      .send({ amount, message });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { orderId } = res.body as DonationOrder;
    return { paymentKey: `pay_${orderId}`, orderId, amount };
  };

  // 실제 충전 API(가짜 Toss)로 라임을 채운다.
  const charge = async (amount: number) => {
    const res = await donor.agent.post('/api/lime/charges').send({ amount });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { orderId } = res.body as LimeChargeOrder;
    const confirmed = await donor.agent
      .post('/api/lime/charges/confirm')
      .send({ paymentKey: `pay_${orderId}`, orderId, amount });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  };
  const donateLime = (body: {
    amount: number;
    message: string;
    orderId: string;
  }) =>
    donor.agent
      .post(`/api/broadcasts/${broadcastId}/lime-donations`)
      .send(body);

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
    viewer = await signUpAndLogIn(app, { nickname: '구경꾼' });
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

  describe('card', () => {
    // red-team 1번: 승인 트랜잭션은 토스를 기다리는 동안 열려 있다. 그사이
    // 쓰인 채팅 X를 받은 클라이언트도 다음 폴링에서 후원 줄을 받아야 한다.
    it('reaches a client whose cursor passed a chat written during a slow Toss approval', async () => {
      const payment = await ordered(5000, '화이팅');
      toss.delayMs = 1500;
      // supertest는 then을 부를 때 요청을 보낸다. 지금 보낸다.
      const confirming = confirm(donor.agent, payment).then((res) => res);
      // 승인 트랜잭션이 행을 잠그고 토스를 기다리기 시작할 때까지 기다린다.
      await expect.poll(() => toss.calls.length).toBe(1);
      const x = await say(viewer.agent, '그사이 채팅');
      expect((await chat(x.id)).map((m) => m.id)).toEqual([]);

      const res = await confirming;
      expect(res.status, JSON.stringify(res.body)).toBe(200);

      expect(await chat(x.id)).toEqual([
        {
          id: expect.any(String) as string,
          body: '화이팅',
          createdAt: expect.any(String) as string,
          author: { id: donor.user.id, nickname: '후원자' },
          donation: { amount: 5000, method: 'TOSS' },
        },
      ]);
    });

    it('adds one line when a confirm is refreshed or races another tab', async () => {
      const payment = await ordered(2000, '두 번');
      toss.delayMs = 300;
      const [a, b] = await Promise.all([
        confirm(donor.agent, payment),
        confirm(donor.agent, payment),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect((await confirm(donor.agent, payment)).status).toBe(200);
      expect((await chat()).map((m) => m.donation)).toEqual([
        { amount: 2000, method: 'TOSS' },
      ]);
    });

    it('adds no line while the order is unpaid or Toss refuses it', async () => {
      const payment = await ordered(1000, '실패');
      toss.failure = new Error('network down');
      expect((await confirm(donor.agent, payment)).status).toBe(502);
      expect(await chat()).toEqual([]);
    });

    // 승인이 토스를 기다리는 동안 스트리머가 방송을 지운다. 후원 줄 쓰기가
    // 방송 행을 참조하므로 삭제와 서로 기다리면 안 된다. 승인은 기록되고,
    // 삭제는 후원 줄과 함께 끝나며, 후원 행은 방송 없이 남는다(#114).
    // 잠금 순서 자체는 donations.e2e의 'locks the broadcast row …'가 본다.
    it('settles a broadcast deletion that overlaps a slow approval', async () => {
      const payment = await ordered(4000, '겹침');
      toss.delayMs = 1500;
      const confirming = confirm(donor.agent, payment).then((res) => res);
      await expect.poll(() => toss.calls.length).toBe(1);
      const deleting = streamer.agent
        .delete(`/api/broadcasts/${broadcastId}`)
        .then((res) => res);
      const [confirmed, deleted] = await Promise.all([confirming, deleting]);
      expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
      expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);
      expect(await prisma.chatMessage.count()).toBe(0);
      expect(
        await prisma.donation.findMany({
          select: { status: true, broadcastId: true },
        }),
      ).toEqual([{ status: 'PAID', broadcastId: null }]);
    });
  });

  describe('deleting the broadcast', () => {
    it('removes the lines with the chat and keeps the donations', async () => {
      await charge(5000);
      await say(viewer.agent, '일반 채팅');
      const res = await donateLime({
        amount: 1000,
        message: '남아요',
        orderId: randomUUID(),
      });
      expect(res.status).toBe(201);
      expect(await chat()).toHaveLength(2);

      const deleted = await streamer.agent.delete(
        `/api/broadcasts/${broadcastId}`,
      );
      expect(deleted.status).toBe(204);
      expect(await prisma.chatMessage.count()).toBe(0);
      expect(
        await prisma.donation.findMany({
          select: { message: true, broadcastId: true },
        }),
      ).toEqual([{ message: '남아요', broadcastId: null }]);
    });
  });

  describe('lime', () => {
    it('adds one line for a donation, even when its key is sent again', async () => {
      await charge(10_000);
      const before = await say(viewer.agent, '앞 채팅');
      const attempt = { amount: 3000, message: '', orderId: randomUUID() };
      expect((await donateLime(attempt)).status).toBe(201);
      expect((await donateLime(attempt)).status).toBe(200);

      expect(await chat(before.id)).toEqual([
        {
          id: expect.any(String) as string,
          body: '',
          createdAt: expect.any(String) as string,
          author: { id: donor.user.id, nickname: '후원자' },
          donation: { amount: 3000, method: 'LIME' },
        },
      ]);
    });
  });
});
