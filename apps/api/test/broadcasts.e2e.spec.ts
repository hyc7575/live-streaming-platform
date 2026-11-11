import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/database.module.js';
import {
  DROP_STREAM_FAILED_MESSAGE,
  END_READY_MESSAGE,
  type BroadcastView,
  PUBLIC_LIST_LIMIT,
  READY_LISTED_MS,
  type PublicStatus,
} from '../src/broadcasts/broadcasts.service.js';
import type { BroadcastStatus as Status } from '../src/generated/prisma/client.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';
import { fakeClockOf, type FakeClock } from './support/fake-clock.js';
import { fakeOmeApiOf, type FakeOmeApi } from './support/fake-ome-api.js';

describe('broadcasts', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ome: FakeOmeApi;
  let clock: FakeClock;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ome = fakeOmeApiOf(app);
    clock = fakeClockOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ome.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  // Written directly so every status is one insert away, without driving the
  // publish flow.
  async function seed(
    streamer: TestUser,
    title: string,
    status: Status,
    startedAt?: Date,
    createdAt?: Date,
  ): Promise<string> {
    const row = await prisma.broadcast.create({
      data: {
        streamerId: streamer.id,
        title,
        status,
        createdAt,
        startedAt: status === 'READY' ? null : (startedAt ?? new Date()),
        endedAt: status === 'ENDED' ? new Date() : null,
      },
    });
    return row.id;
  }

  function titles(body: unknown): string[] {
    return (body as BroadcastView[]).map((b) => b.title);
  }

  describe('POST /api/broadcasts', () => {
    it('rejects an anonymous caller with 401 and stores nothing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/broadcasts')
        .send({ title: '첫 방송' });
      expect(res.status).toBe(401);
      expect(await prisma.broadcast.count()).toBe(0);
    });

    it('creates a READY broadcast owned by the logged-in user', async () => {
      const { user, agent } = await signUpAndLogIn(app, { nickname: '불씨' });
      const res = await agent
        .post('/api/broadcasts')
        .send({ title: '  첫 방송  ', description: '화면 공유 테스트' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        title: '첫 방송',
        description: '화면 공유 테스트',
        status: 'READY',
        startedAt: null,
        endedAt: null,
        createdAt: expect.any(String) as string,
        recordingFiles: [],
        recordingParts: [],
        thumbnailUrl: null,
        standbyImageUrl: null,
        streamer: { id: user.id, nickname: '불씨' },
      });
    });

    it('defaults the description to an empty string', async () => {
      const { agent } = await signUpAndLogIn(app);
      const res = await agent.post('/api/broadcasts').send({ title: '제목만' });
      expect(res.status).toBe(201);
      expect((res.body as BroadcastView).description).toBe('');
    });

    it.each([
      ['a missing title', {}],
      ['a blank title', { title: '   ' }],
      ['a title over 100 characters', { title: 'a'.repeat(101) }],
      [
        'a description over 2000 characters',
        { title: 'ok', description: 'a'.repeat(2001) },
      ],
    ])('rejects %s with 400', async (_case, body) => {
      const { agent } = await signUpAndLogIn(app);
      const res = await agent.post('/api/broadcasts').send(body);
      expect(res.status).toBe(400);
      expect(await prisma.broadcast.count()).toBe(0);
    });
  });

  describe('GET /api/broadcasts', () => {
    // Relative to the injected clock, which READY_LISTED_MS is measured on.
    function ago(ms: number): Date {
      return new Date(clock.now().getTime() - ms);
    }

    it('lists LIVE, then READY made in the last day, then ENDED, newest first', async () => {
      const { user: a } = await signUpAndLogIn(app, { nickname: 'A' });
      const { user: b } = await signUpAndLogIn(app, { nickname: 'B' });
      await seed(a, 'A 종료', 'ENDED', new Date('2026-11-01T10:00:00Z'));
      await seed(a, 'A 준비', 'READY', undefined, ago(60_000));
      await seed(b, 'B 지난 준비', 'READY', undefined, ago(READY_LISTED_MS));
      await seed(a, 'A 옛 LIVE', 'LIVE', new Date('2026-11-01T09:00:00Z'));
      await seed(b, 'B 준비', 'READY', undefined, ago(1_000));
      await seed(b, 'B 새 LIVE', 'LIVE', new Date('2026-11-01T11:00:00Z'));

      const res = await request(app.getHttpServer()).get('/api/broadcasts');
      expect(res.status).toBe(200);
      expect(titles(res.body)).toEqual([
        'B 새 LIVE',
        'A 옛 LIVE',
        'B 준비',
        'A 준비',
        'A 종료',
      ]);
      expect((res.body as BroadcastView[])[0]?.streamer).toEqual({
        id: b.id,
        nickname: 'B',
      });
    });

    it('drops a READY broadcast from the list a day after it was made, and keeps it in 내 방송', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      await seed(user, '내 준비', 'READY', undefined, clock.now());

      clock.advance(READY_LISTED_MS - 1_000);
      expect(titles((await agent.get('/api/broadcasts')).body)).toEqual([
        '내 준비',
      ]);

      clock.advance(1_000);
      expect((await agent.get('/api/broadcasts')).body).toEqual([]);
      expect(titles((await agent.get('/api/me/broadcasts')).body)).toEqual([
        '내 준비',
      ]);
    });

    it('fills the list cap in LIVE, READY, ENDED order', async () => {
      const { user } = await signUpAndLogIn(app);
      await prisma.broadcast.createMany({
        data: Array.from({ length: PUBLIC_LIST_LIMIT }, (_, i) => ({
          streamerId: user.id,
          title: `종료 ${i}`,
          status: 'ENDED' as const,
          startedAt: new Date(),
          endedAt: new Date(),
        })),
      });
      await seed(user, '준비', 'READY', undefined, clock.now());
      await seed(user, 'LIVE', 'LIVE');

      const res = await request(app.getHttpServer()).get('/api/broadcasts');
      const body = res.body as BroadcastView[];
      expect(body).toHaveLength(PUBLIC_LIST_LIMIT);
      expect(body.slice(0, 2).map((v) => v.title)).toEqual(['LIVE', '준비']);
    });

    it.each<[PublicStatus, string[]]>([
      ['LIVE', ['LIVE 방송']],
      ['READY', ['준비 방송']],
      ['ENDED', ['종료 방송']],
    ])('filters by status=%s', async (status, expected) => {
      const { user } = await signUpAndLogIn(app);
      await seed(user, '준비 방송', 'READY', undefined, clock.now());
      await seed(user, '지난 준비', 'READY', undefined, ago(READY_LISTED_MS));
      await seed(user, 'LIVE 방송', 'LIVE');
      await seed(user, '종료 방송', 'ENDED');
      const res = await request(app.getHttpServer()).get(
        `/api/broadcasts?status=${status}`,
      );
      expect(res.status).toBe(200);
      expect(titles(res.body)).toEqual(expected);
    });

    it.each(['live', 'BOGUS', 'REPLAY'])(
      'rejects status=%s with 400',
      async (status) => {
        const res = await request(app.getHttpServer()).get(
          `/api/broadcasts?status=${status}`,
        );
        expect(res.status).toBe(400);
      },
    );
  });

  describe('GET /api/replays', () => {
    async function withRecording(id: string, endedAt?: Date): Promise<void> {
      await prisma.broadcast.update({
        where: { id },
        data: { recordingFiles: [`${id}/1_0.mp4`], endedAt },
      });
    }

    it('lists ENDED broadcasts with a recording, latest end first', async () => {
      const { user } = await signUpAndLogIn(app);
      const older = await seed(user, '이전 녹화', 'ENDED');
      await withRecording(older, new Date('2026-11-01T10:00:00Z'));
      const newer = await seed(user, '최근 녹화', 'ENDED');
      await withRecording(newer, new Date('2026-11-02T10:00:00Z'));
      await seed(user, '녹화 없음', 'ENDED');
      await withRecording(await seed(user, '녹화 중 LIVE', 'LIVE'));

      const res = await request(app.getHttpServer()).get('/api/replays');
      expect(res.status).toBe(200);
      expect(titles(res.body)).toEqual(['최근 녹화', '이전 녹화']);
      expect((res.body as BroadcastView[])[0]?.recordingFiles).toEqual([
        `${newer}/1_0.mp4`,
      ]);
    });
  });

  describe('GET /api/me/broadcasts', () => {
    it('rejects an anonymous caller with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/me/broadcasts');
      expect(res.status).toBe(401);
    });

    it('lists every status of the caller’s broadcasts and nobody else’s', async () => {
      const { user: a, agent } = await signUpAndLogIn(app);
      const { user: b } = await signUpAndLogIn(app);
      await seed(a, 'A 종료', 'ENDED');
      await seed(a, 'A LIVE', 'LIVE');
      await seed(b, 'B 준비', 'READY');
      await agent.post('/api/broadcasts').send({ title: 'A 준비' });

      const res = await agent.get('/api/me/broadcasts');
      expect(res.status).toBe(200);
      expect(titles(res.body)).toEqual(['A 준비', 'A LIVE', 'A 종료']);
      expect((res.body as BroadcastView[])[0]?.status).toBe('READY');
    });
  });

  describe('GET /api/broadcasts/:id', () => {
    it.each<Status>(['READY', 'LIVE', 'ENDED'])(
      'returns a %s broadcast to an anonymous caller',
      async (status) => {
        const { user } = await signUpAndLogIn(app, { nickname: '불씨' });
        const id = await seed(user, '상세', status);
        const res = await request(app.getHttpServer()).get(
          `/api/broadcasts/${id}`,
        );
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          id,
          title: '상세',
          status,
          streamer: { id: user.id, nickname: '불씨' },
        });
        expect(res.body).not.toHaveProperty('streamer.email');
      },
    );

    it.each([
      ['an unknown id', '00000000-0000-4000-8000-000000000000'],
      ['a malformed id', 'not-a-uuid'],
    ])('answers 404 for %s', async (_case, id) => {
      const res = await request(app.getHttpServer()).get(
        `/api/broadcasts/${id}`,
      );
      expect(res.status).toBe(404);
    });
  });

  // Who may call PATCH and DELETE is covered by authorization-matrix.e2e.spec.ts.
  describe('PATCH /api/broadcasts/:id', () => {
    it('changes only the fields sent and trims them like create', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '원래 제목', 'ENDED');
      await prisma.broadcast.update({
        where: { id },
        data: { description: '원래 설명' },
      });

      const res = await agent
        .patch(`/api/broadcasts/${id}`)
        .send({ title: '  새 제목  ' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        title: '새 제목',
        description: '원래 설명',
      });

      const cleared = await agent
        .patch(`/api/broadcasts/${id}`)
        .send({ description: '' });
      expect(cleared.body).toMatchObject({ title: '새 제목', description: '' });
    });

    it.each([
      ['an empty body', {}],
      ['only unknown fields', { status: 'ENDED' }],
      ['a blank title', { title: '   ' }],
      ['a title over 100 characters', { title: 'a'.repeat(101) }],
      ['a description over 2000 characters', { description: 'a'.repeat(2001) }],
      ['a non-string title', { title: 42 }],
    ])('rejects %s with 400 and changes nothing', async (_case, body) => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '원래 제목', 'READY');
      const before = await prisma.broadcast.findUniqueOrThrow({
        where: { id },
      });
      const res = await agent.patch(`/api/broadcasts/${id}`).send(body);
      expect(res.status).toBe(400);
      expect(
        await prisma.broadcast.findUniqueOrThrow({ where: { id } }),
      ).toEqual(before);
    });
  });

  const row = (id: string) => prisma.broadcast.findUnique({ where: { id } });

  describe('POST /api/broadcasts/:id/end', () => {
    it('refuses a READY broadcast with 409 and keeps it READY', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '시작 전', 'READY');
      const res = await agent.post(`/api/broadcasts/${id}/end`);
      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toBe(END_READY_MESSAGE);
      expect(await row(id)).toMatchObject({ status: 'READY', endedAt: null });
      expect(ome.calls).toEqual([]);
    });

    it('keeps the broadcast ENDED when OME fails, and a retry drops the stream', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '송출 중', 'LIVE');
      ome.failing = true;
      const failed = await agent.post(`/api/broadcasts/${id}/end`);
      expect(failed.status).toBe(502);
      expect((failed.body as { message: string }).message).toBe(
        DROP_STREAM_FAILED_MESSAGE,
      );
      const ended = await row(id);
      expect(ended).toMatchObject({ status: 'ENDED' });
      expect(ended?.endedAt).toBeInstanceOf(Date);

      ome.failing = false;
      const retried = await agent.post(`/api/broadcasts/${id}/end`);
      expect(retried.status).toBe(200);
      expect(retried.body).toMatchObject({
        status: 'ENDED',
        endedAt: ended?.endedAt?.toISOString(),
      });
      expect(ome.calls).toEqual([
        { broadcastId: id, statusAtCall: 'ENDED' },
        { broadcastId: id, statusAtCall: 'ENDED' },
      ]);
      // Only the successful drop is followed by a recording stop.
      expect(ome.recordCalls).toEqual([
        { kind: 'stop', broadcastId: id, statusAtCall: 'ENDED' },
      ]);
    });

    it('stops the recording after the drop, and again on a second end', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '녹화 중', 'LIVE');
      ome.records = [id];
      const first = await agent.post(`/api/broadcasts/${id}/end`);
      expect(first.status).toBe(200);
      expect(ome.records).toEqual([]);
      const second = await agent.post(`/api/broadcasts/${id}/end`);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(ome.recordCalls).toEqual([
        { kind: 'stop', broadcastId: id, statusAtCall: 'ENDED' },
        { kind: 'stop', broadcastId: id, statusAtCall: 'ENDED' },
      ]);
    });

    it('still ends with 200 when OME cannot stop the recording', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '녹화 중', 'LIVE');
      ome.recordFailing = true;
      const res = await agent.post(`/api/broadcasts/${id}/end`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ENDED' });
    });
  });

  describe('DELETE /api/broadcasts/:id', () => {
    it('stops the recording of a LIVE broadcast before deleting it', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '송출 중', 'LIVE');
      ome.records = [id];
      expect((await agent.delete(`/api/broadcasts/${id}`)).status).toBe(204);
      expect(ome.records).toEqual([]);
      expect(ome.recordCalls).toEqual([
        { kind: 'stop', broadcastId: id, statusAtCall: 'ENDED' },
      ]);
    });

    it('ends a LIVE broadcast first and keeps it when OME fails, then a retry deletes it', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '송출 중', 'LIVE');
      ome.failing = true;
      const failed = await agent.delete(`/api/broadcasts/${id}`);
      expect(failed.status).toBe(502);
      expect(await row(id)).toMatchObject({ status: 'ENDED' });

      ome.failing = false;
      expect((await agent.delete(`/api/broadcasts/${id}`)).status).toBe(204);
      expect(await row(id)).toBeNull();
      expect(ome.calls).toEqual([
        { broadcastId: id, statusAtCall: 'ENDED' },
        { broadcastId: id, statusAtCall: 'ENDED' },
      ]);
    });

    it('answers 404 to a second delete of the same broadcast', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '지울 방송', 'READY');
      expect((await agent.delete(`/api/broadcasts/${id}`)).status).toBe(204);
      expect((await agent.delete(`/api/broadcasts/${id}`)).status).toBe(404);
    });
  });
});
