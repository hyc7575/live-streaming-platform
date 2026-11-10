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
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import {
  ENDED_PUBLISH_MESSAGE,
  OTHER_LIVE_MESSAGE,
  type PublishTicket,
} from '../src/publish/publish.service.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';
import { fakeClockOf, type FakeClock } from './support/fake-clock.js';
import { fakeOmeApiOf, type FakeOmeApi } from './support/fake-ome-api.js';
import {
  admissionBody,
  mintedToken as mintToken,
  omeSignature,
  postAdmission,
  whipUrl,
} from './support/webhook.js';

const unknownId = '00000000-0000-4000-8000-000000000000';

describe('publish', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clock: FakeClock;
  let ome: FakeOmeApi;
  let owner: { user: TestUser; agent: TestAgent };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    clock = fakeClockOf(app);
    ome = fakeOmeApiOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ome.reset();
    owner = await signUpAndLogIn(app, { nickname: '소유자' });
  });

  afterAll(async () => {
    await app.close();
  });

  async function seed(status: BroadcastStatus, streamer = owner.user) {
    const now = clock.now();
    const row = await prisma.broadcast.create({
      data: {
        streamerId: streamer.id,
        title: `${status} 방송`,
        status,
        startedAt: status === 'READY' ? null : now,
        endedAt: status === 'ENDED' ? now : null,
      },
    });
    return row.id;
  }

  const statusOf = async (id: string) =>
    (await prisma.broadcast.findUniqueOrThrow({ where: { id } })).status;

  const issue = (agent: TestAgent, id: string) =>
    agent.post(`/api/broadcasts/${id}/publish-token`);

  async function tokenFor(id: string): Promise<string> {
    const res = await issue(owner.agent, id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const url = new URL((res.body as PublishTicket).publishUrl, 'http://x');
    return url.searchParams.get('token') ?? '';
  }

  // A token the API would never issue (ENDED, expired), signed with the
  // same key so only the rule under test can reject it.
  function mintedToken(id: string, now = clock.now()): string {
    return mintToken({ broadcastId: id, streamerId: owner.user.id }, now);
  }

  const admission = (body: string, signature?: string | null) =>
    postAdmission(app, body, signature);

  describe('POST /api/broadcasts/:id/publish-token', () => {
    it('returns a same-origin WHIP path with a five-minute token', async () => {
      const id = await seed('READY');
      const before = clock.now().getTime();
      const res = await issue(owner.agent, id);
      expect(res.status).toBe(201);
      const ticket = res.body as { publishUrl: string; expiresAt: string };
      expect(ticket.publishUrl).toMatch(
        new RegExp(
          `^/app/${id}\\?direction=whip&transport=all&token=[0-9]+\\.[A-Za-z0-9_-]+$`,
        ),
      );
      const ttl = Date.parse(ticket.expiresAt) - before;
      expect(ttl).toBeGreaterThan(4 * 60_000);
      expect(ttl).toBeLessThanOrEqual(5 * 60_000);
      expect(await statusOf(id)).toBe('READY');
    });

    it('issues again for the broadcast that is already LIVE', async () => {
      const id = await seed('LIVE');
      expect((await issue(owner.agent, id)).status).toBe(201);
    });

    it('refuses while another broadcast of the streamer is LIVE', async () => {
      await seed('LIVE');
      const id = await seed('READY');
      const res = await issue(owner.agent, id);
      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toBe(
        OTHER_LIVE_MESSAGE,
      );
      expect(OTHER_LIVE_MESSAGE).toBe('기존 방송을 종료하세요.');
    });

    it('ignores another streamer’s LIVE broadcast', async () => {
      const other = await signUpAndLogIn(app);
      await seed('LIVE', other.user);
      expect((await issue(owner.agent, await seed('READY'))).status).toBe(201);
    });

    it('refuses an ENDED broadcast, which never goes LIVE again', async () => {
      const id = await seed('ENDED');
      const res = await issue(owner.agent, id);
      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toBe(
        ENDED_PUBLISH_MESSAGE,
      );
    });

    it('is 401 anonymous, 403 for another user, 404 when missing', async () => {
      const id = await seed('READY');
      const other = await signUpAndLogIn(app);
      expect((await issue(request.agent(app.getHttpServer()), id)).status).toBe(
        401,
      );
      expect((await issue(other.agent, id)).status).toBe(403);
      expect((await issue(owner.agent, unknownId)).status).toBe(404);
      expect((await issue(owner.agent, 'not-a-uuid')).status).toBe(404);
    });
  });

  describe('POST /api/ome/admission', () => {
    it('admits a READY broadcast with its token and makes it LIVE', async () => {
      const id = await seed('READY');
      const res = await admission(
        admissionBody(whipUrl(id, await tokenFor(id))),
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ allowed: true });
      const row = await prisma.broadcast.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('LIVE');
      expect(row.startedAt).toEqual(clock.now());
      expect(row.disconnectedAt).toBeNull();
      const detail = await request(app.getHttpServer()).get(
        `/api/broadcasts/${id}`,
      );
      expect(detail.body).toMatchObject({ status: 'LIVE' });
      await vi.waitFor(() =>
        expect(ome.recordCalls).toEqual([
          { kind: 'start', broadcastId: id, statusAtCall: 'LIVE' },
        ]),
      );
    });

    it('answers without waiting for the recording to start', async () => {
      ome.startRecordHangs = true;
      const id = await seed('READY');
      const res = await admission(
        admissionBody(whipUrl(id, await tokenFor(id))),
      );
      expect(res.body).toEqual({ allowed: true });
      expect(await statusOf(id)).toBe('LIVE');
    });

    it('admits even when OME refuses to start the recording', async () => {
      ome.recordFailing = true;
      const id = await seed('READY');
      const res = await admission(
        admissionBody(whipUrl(id, await tokenFor(id))),
      );
      expect(res.body).toEqual({ allowed: true });
      await vi.waitFor(() => expect(ome.recordCalls).toHaveLength(1));
    });

    it.each([
      ['missing', () => null, 'missing token'],
      [
        'tampered',
        (t: string) => t.replace(/^\d+/, (exp) => `${+exp + 60}`),
        'invalid token',
      ],
      ['garbage', () => 'not-a-real-token', 'invalid token'],
    ])('refuses a %s token', async (_case, tamper, reason) => {
      const id = await seed('READY');
      const token = tamper(await tokenFor(id));
      const res = await admission(admissionBody(whipUrl(id, token)));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ allowed: false, reason });
      expect(await statusOf(id)).toBe('READY');
    });

    it('refuses an expired token', async () => {
      const id = await seed('READY');
      const token = mintedToken(
        id,
        new Date(clock.now().getTime() - 6 * 60_000),
      );
      const res = await admission(admissionBody(whipUrl(id, token)));
      expect(res.body).toEqual({ allowed: false, reason: 'invalid token' });
      expect(await statusOf(id)).toBe('READY');
    });

    it('refuses a token issued for another broadcast', async () => {
      const id = await seed('READY');
      const other = await seed('READY');
      const res = await admission(
        admissionBody(whipUrl(id, await tokenFor(other))),
      );
      expect(res.body).toEqual({ allowed: false, reason: 'invalid token' });
      expect(await statusOf(id)).toBe('READY');
      expect(await statusOf(other)).toBe('READY');
    });

    it.each([
      ['ENDED', 'broadcast ended'],
      ['LIVE', 'broadcast already live'],
    ] as const)('refuses a %s broadcast', async (status, reason) => {
      const id = await seed(status);
      const res = await admission(admissionBody(whipUrl(id, mintedToken(id))));
      expect(res.body).toEqual({ allowed: false, reason });
      expect(await statusOf(id)).toBe(status);
      expect(ome.recordCalls).toEqual([]);
    });

    it('refuses a reconnect after the streamer ends the broadcast', async () => {
      const id = await seed('READY');
      const live = await admission(
        admissionBody(whipUrl(id, await tokenFor(id))),
      );
      expect(live.body).toEqual({ allowed: true });
      const end = await owner.agent.post(`/api/broadcasts/${id}/end`);
      expect(end.status, JSON.stringify(end.body)).toBe(200);
      const res = await admission(admissionBody(whipUrl(id, mintedToken(id))));
      expect(res.body).toEqual({ allowed: false, reason: 'broadcast ended' });
      expect(await statusOf(id)).toBe('ENDED');
    });

    it('lets one broadcast per streamer be LIVE', async () => {
      const first = await seed('READY');
      const second = await seed('READY');
      const firstToken = await tokenFor(first);
      const secondToken = await tokenFor(second);
      expect(
        (await admission(admissionBody(whipUrl(first, firstToken)))).body,
      ).toEqual({ allowed: true });
      const res = await admission(admissionBody(whipUrl(second, secondToken)));
      expect(res.body).toEqual({
        allowed: false,
        reason: 'streamer already live',
      });
      expect(await statusOf(first)).toBe('LIVE');
      expect(await statusOf(second)).toBe('READY');
    });

    it('refuses an unknown broadcast or a path outside the app', async () => {
      for (const url of [
        whipUrl(unknownId, 'x'),
        whipUrl('not-a-uuid', 'x'),
        'http://127.0.0.1:3333/other/stream?token=x',
      ]) {
        expect((await admission(admissionBody(url))).body).toEqual({
          allowed: false,
          reason: 'unknown broadcast',
        });
      }
    });

    it('starts the grace period on closing and answers {}', async () => {
      const id = await seed('LIVE');
      const res = await admission(
        admissionBody(whipUrl(id, mintedToken(id)), { status: 'closing' }),
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      const row = await prisma.broadcast.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('LIVE');
      expect(row.disconnectedAt).toEqual(clock.now());
    });

    it('starts the grace period on a closing whose token expired', async () => {
      const id = await seed('LIVE');
      const expired = mintedToken(
        id,
        new Date(clock.now().getTime() - 60 * 60_000),
      );
      const res = await admission(
        admissionBody(whipUrl(id, expired), { status: 'closing' }),
      );
      expect(res.body).toEqual({});
      const row = await prisma.broadcast.findUniqueOrThrow({ where: { id } });
      expect(row.disconnectedAt).toEqual(clock.now());
    });

    it('ignores closing of playback connections and unknown streams', async () => {
      const id = await seed('LIVE');
      const before = await prisma.broadcast.findMany();
      for (const body of [
        admissionBody(`http://127.0.0.1:3333/app/${id}/llhls.m3u8`, {
          direction: 'outgoing',
          status: 'closing',
        }),
        admissionBody(whipUrl('not-a-uuid', null), { status: 'closing' }),
        admissionBody(whipUrl(unknownId, null), { status: 'closing' }),
        admissionBody('http://127.0.0.1:3333/other/stream', {
          status: 'closing',
        }),
      ]) {
        const res = await admission(body);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({});
      }
      expect(await prisma.broadcast.findMany()).toEqual(before);
    });

    it('allows outgoing (playback) connections', async () => {
      const id = await seed('LIVE');
      const res = await admission(
        admissionBody(`http://127.0.0.1:3333/app/${id}/llhls.m3u8`, {
          direction: 'outgoing',
        }),
      );
      expect(res.body).toEqual({ allowed: true });
    });

    it.each([
      ['missing', null],
      ['forged', 'forged'],
      ['signed with another secret', 'other'],
    ])('refuses a %s signature with 401', async (_case, signature) => {
      const id = await seed('READY');
      const body = admissionBody(whipUrl(id, await tokenFor(id)));
      const header =
        signature === 'other' ? omeSignature(body, 'other-secret') : signature;
      const res = await admission(body, header);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ allowed: false });
      expect(await statusOf(id)).toBe('READY');
    });

    it('checks the signature over the exact bytes OME sent', async () => {
      const id = await seed('READY');
      const body = admissionBody(whipUrl(id, await tokenFor(id)));
      const reformatted = JSON.stringify(JSON.parse(body), null, 2);
      const res = await admission(reformatted, omeSignature(body));
      expect(res.status).toBe(401);
      expect(await statusOf(id)).toBe('READY');
    });

    it('rejects a signed body of the wrong shape with 400', async () => {
      const res = await admission(JSON.stringify({ request: { url: 1 } }));
      expect(res.status).toBe(400);
    });
  });
});
