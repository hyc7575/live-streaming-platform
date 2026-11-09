import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/database.module.js';
import type { PublishTicket } from '../src/publish/publish.service.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';
import { fakeClockOf, type FakeClock } from './support/fake-clock.js';
import { closePublish, openPublish } from './support/webhook.js';

// PRD §7.4 abnormal end: a dropped publish connection may reconnect to the
// same broadcast within 30 s, through the real webhook.

const GRACE_MS = 30_000;

describe('reconnect grace', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clock: FakeClock;
  let owner: { user: TestUser; agent: TestAgent };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    clock = fakeClockOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    clock.set(new Date('2026-11-10T12:00:00.000Z'));
    owner = await signUpAndLogIn(app, { nickname: '소유자' });
  });

  afterAll(async () => {
    await app.close();
  });

  // A fresh token, the way the publish screen gets one before connecting.
  async function tokenFor(id: string): Promise<string> {
    const res = await owner.agent.post(`/api/broadcasts/${id}/publish-token`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const url = new URL((res.body as PublishTicket).publishUrl, 'http://x');
    return url.searchParams.get('token') ?? '';
  }

  async function liveBroadcast(): Promise<string> {
    const created = await owner.agent
      .post('/api/broadcasts')
      .send({ title: '유예 확인' });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const res = await openPublish(app, id, await tokenFor(id));
    expect(res.body).toEqual({ allowed: true });
    return id;
  }

  const rowOf = (id: string) =>
    prisma.broadcast.findUniqueOrThrow({ where: { id } });

  async function detailOf(id: string) {
    const res = await request(app.getHttpServer()).get(`/api/broadcasts/${id}`);
    expect(res.status).toBe(200);
    return res.body as {
      status: string;
      startedAt: string | null;
      endedAt: string | null;
    };
  }

  async function reconnect(id: string) {
    const res = await openPublish(app, id, await tokenFor(id));
    expect(res.status).toBe(200);
    return res.body as unknown;
  }

  it('lets the same broadcast reconnect 29 s after closing', async () => {
    const id = await liveBroadcast();
    const startedAt = (await detailOf(id)).startedAt;
    expect((await closePublish(app, id)).body).toEqual({});

    clock.advance(GRACE_MS - 1000);
    expect(await reconnect(id)).toEqual({ allowed: true });
    expect(await detailOf(id)).toMatchObject({
      status: 'LIVE',
      startedAt,
      endedAt: null,
    });
    expect((await rowOf(id)).disconnectedAt).toBeNull();
  });

  it('keeps the first time when the same closing arrives twice', async () => {
    const id = await liveBroadcast();
    await closePublish(app, id);
    const first = await rowOf(id);
    expect(first.disconnectedAt).toEqual(clock.now());

    clock.advance(10_000);
    expect((await closePublish(app, id)).body).toEqual({});
    expect(await rowOf(id)).toEqual(first);
  });

  it.each(['READY', 'ENDED'] as const)(
    'changes nothing on closing for a %s broadcast',
    async (status) => {
      const now = clock.now();
      const { id } = await prisma.broadcast.create({
        data: {
          streamerId: owner.user.id,
          title: status,
          status,
          startedAt: status === 'ENDED' ? now : null,
          endedAt: status === 'ENDED' ? now : null,
        },
      });
      const before = await rowOf(id);
      expect((await closePublish(app, id)).body).toEqual({});
      expect(await rowOf(id)).toEqual(before);
    },
  );

  it('refuses a second connection while the publisher is connected', async () => {
    const id = await liveBroadcast();
    const before = await rowOf(id);
    expect(await reconnect(id)).toEqual({
      allowed: false,
      reason: 'broadcast already live',
    });
    expect(await rowOf(id)).toEqual(before);
  });

  it('refuses a reconnect once 30 s have passed, before any sweep', async () => {
    const id = await liveBroadcast();
    await closePublish(app, id);
    clock.advance(GRACE_MS);
    const before = await rowOf(id);
    expect(await reconnect(id)).toEqual({
      allowed: false,
      reason: 'broadcast ended',
    });
    expect(await rowOf(id)).toEqual(before);
  });

  it('lets only one of two racing reconnects through', async () => {
    const id = await liveBroadcast();
    await closePublish(app, id);
    clock.advance(5000);
    const [first, second] = [await tokenFor(id), await tokenFor(id)];
    const answers = await Promise.all([
      openPublish(app, id, first),
      openPublish(app, id, second),
    ]);
    expect(answers.map((r) => r.body as unknown)).toEqual(
      expect.arrayContaining([
        { allowed: true },
        { allowed: false, reason: 'broadcast already live' },
      ]),
    );
    expect(await rowOf(id)).toMatchObject({
      status: 'LIVE',
      disconnectedAt: null,
    });
  });
});
