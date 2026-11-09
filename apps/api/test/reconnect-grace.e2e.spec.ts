import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PrismaService } from '../src/database/database.module.js';
import type { PublishTicket } from '../src/publish/publish.service.js';
import type { PublishSweeper } from '../src/publish/publish-sweeper.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  sweeperOf,
  type TestUser,
} from './support/app.js';
import { fakeClockOf, type FakeClock } from './support/fake-clock.js';
import { fakeOmeApiOf, type FakeOmeApi } from './support/fake-ome-api.js';
import { closePublish, mintedToken, openPublish } from './support/webhook.js';

// PRD §7.4 abnormal end

const GRACE_MS = 30_000;

describe('reconnect grace', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clock: FakeClock;
  let ome: FakeOmeApi;
  let sweeper: PublishSweeper;
  let owner: { user: TestUser; agent: TestAgent };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    clock = fakeClockOf(app);
    ome = fakeOmeApiOf(app);
    sweeper = sweeperOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ome.reset();
    clock.set(new Date('2026-11-10T12:00:00.000Z'));
    owner = await signUpAndLogIn(app, { nickname: '소유자' });
  });

  afterAll(async () => {
    await app.close();
  });

  async function tokenFor(id: string, as = owner): Promise<string> {
    const res = await as.agent.post(`/api/broadcasts/${id}/publish-token`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const url = new URL((res.body as PublishTicket).publishUrl, 'http://x');
    return url.searchParams.get('token') ?? '';
  }

  async function liveBroadcast(as = owner): Promise<string> {
    const created = await as.agent
      .post('/api/broadcasts')
      .send({ title: '유예 확인' });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const res = await openPublish(app, id, await tokenFor(id, as));
    expect(res.body).toEqual({ allowed: true });
    ome.streams.push(id);
    return id;
  }

  async function drop(id: string) {
    ome.streams = ome.streams.filter((s) => s !== id);
    expect((await closePublish(app, id)).body).toEqual({});
  }

  const sweep = () => sweeper.sweep(clock.now());

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
    await drop(id);

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
    await drop(id);
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
    await drop(id);
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
    await drop(id);
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

  it('ends the broadcast at the first sweep 30 s after closing, not before', async () => {
    const id = await liveBroadcast();
    await drop(id);
    const droppedAt = clock.now();

    clock.advance(GRACE_MS - 1000);
    await sweep();
    expect(await detailOf(id)).toMatchObject({ status: 'LIVE', endedAt: null });

    clock.advance(1000);
    await sweep();
    expect(await detailOf(id)).toMatchObject({
      status: 'ENDED',
      endedAt: clock.now().toISOString(),
    });
    expect((await rowOf(id)).disconnectedAt).toEqual(droppedAt);
    const token = mintedToken(
      { broadcastId: id, streamerId: owner.user.id },
      clock.now(),
    );
    expect((await openPublish(app, id, token)).body).toEqual({
      allowed: false,
      reason: 'broadcast ended',
    });
    expect((await detailOf(id)).status).toBe('ENDED');
    expect(ome.calls).toEqual([]);
  });

  it('keeps a broadcast whose closing arrived after the reconnect', async () => {
    const id = await liveBroadcast();
    await drop(id);
    clock.advance(1000);
    expect(await reconnect(id)).toEqual({ allowed: true });
    ome.streams = [id];
    clock.advance(500);
    await closePublish(app, id);
    expect((await rowOf(id)).disconnectedAt).toEqual(clock.now());

    clock.advance(1000);
    await sweep();
    expect((await rowOf(id)).disconnectedAt).toBeNull();
    clock.advance(10 * GRACE_MS);
    await sweep();
    expect(await detailOf(id)).toMatchObject({ status: 'LIVE', endedAt: null });
  });

  it('leaves a drop newer than the sweep start for the next sweep', async () => {
    const id = await liveBroadcast();
    const sweepStart = clock.now();
    clock.advance(100);
    await closePublish(app, id);
    const before = await rowOf(id);

    await sweeper.sweep(sweepStart);
    expect(await rowOf(id)).toEqual(before);
    clock.advance(GRACE_MS);
    await sweep();
    expect(await rowOf(id)).toMatchObject({
      status: 'LIVE',
      disconnectedAt: null,
    });
  });

  it('starts the grace for a LIVE broadcast OME stopped listing without closing', async () => {
    const id = await liveBroadcast();
    ome.streams = [];
    const missedAt = clock.now();

    await sweep();
    expect(await rowOf(id)).toMatchObject({
      status: 'LIVE',
      disconnectedAt: missedAt,
    });
    clock.advance(GRACE_MS - 1);
    await sweep();
    expect((await detailOf(id)).status).toBe('LIVE');
    clock.advance(1);
    await sweep();
    expect(await detailOf(id)).toMatchObject({
      status: 'ENDED',
      endedAt: clock.now().toISOString(),
    });
  });

  it('changes nothing when OME cannot list its streams', async () => {
    const connected = await liveBroadcast();
    const expired = await liveBroadcast(await signUpAndLogIn(app));
    ome.streams = [];
    await closePublish(app, expired);
    clock.advance(GRACE_MS * 3);
    ome.listFailing = true;
    const before = await prisma.broadcast.findMany({ orderBy: { id: 'asc' } });
    expect(before.map((b) => b.id).sort()).toEqual([connected, expired].sort());

    await sweep();
    expect(await prisma.broadcast.findMany({ orderBy: { id: 'asc' } })).toEqual(
      before,
    );
  });

  it.each([
    ['exactly 30 s', GRACE_MS, { allowed: false, reason: 'broadcast ended' }],
    ['29.999 s', GRACE_MS - 1, { allowed: true }],
  ] as const)(
    'resolves a reconnect racing the sweep %s after closing to one outcome',
    async (_case, elapsed, answer) => {
      const id = await liveBroadcast();
      await drop(id);
      clock.advance(elapsed);
      const token = await tokenFor(id);

      const [res] = await Promise.all([openPublish(app, id, token), sweep()]);
      expect(res.body).toEqual(answer);
      expect((await detailOf(id)).status).toBe(
        answer.allowed ? 'LIVE' : 'ENDED',
      );
    },
  );
});

describe('sweep timer', () => {
  it('sweeps on its own every interval until the app closes', async () => {
    const app = await createTestApp({ sweepIntervalMs: 20 });
    const prisma = app.get(PrismaService);
    await resetDatabase(app);
    const { user } = await signUpAndLogIn(app);
    const { id } = await prisma.broadcast.create({
      data: {
        streamerId: user.id,
        title: '타이머',
        status: 'LIVE',
        startedAt: fakeClockOf(app).now(),
      },
    });
    const disconnectedAt = async () =>
      (await prisma.broadcast.findUniqueOrThrow({ where: { id } }))
        .disconnectedAt;
    await vi.waitFor(async () => {
      expect(await disconnectedAt()).toEqual(fakeClockOf(app).now());
    });
    await app.close();
  });
});
