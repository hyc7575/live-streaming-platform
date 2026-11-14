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
import { seedGames } from '../src/games/seed-games.js';
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
    await seedGames(prisma, [
      {
        qid: 'Q223341',
        nameKo: '리그 오브 레전드',
        nameEn: 'League of Legends',
        aliasesKo: ['롤'],
      },
    ]);
    ome.reset();
  });

  const LOL_GAME = { qid: 'Q223341', name: '리그 오브 레전드' };

  afterAll(async () => {
    await app.close();
  });

  // 직접 써 넣어서, 송출 흐름을 거치지 않고도 어떤 상태든
  // insert 한 번으로 만든다.
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
        category: 'ETC',
        status: 'READY',
        startedAt: null,
        endedAt: null,
        disconnectedAt: null,
        createdAt: expect.any(String) as string,
        recordingFiles: [],
        recordingParts: [],
        thumbnailUrl: null,
        standbyImageUrl: null,
        game: null,
        streamer: { id: user.id, nickname: '불씨' },
      });
    });

    it('stores the Korean name of a listed game, whatever name was sent', async () => {
      const { agent } = await signUpAndLogIn(app);
      const res = await agent.post('/api/broadcasts').send({
        title: '랭크 게임',
        category: 'GAME',
        gameQid: 'Q223341',
        gameName: '아무거나',
      });
      expect(res.status).toBe(201);
      const { id, game } = res.body as BroadcastView;
      expect(game).toEqual(LOL_GAME);
      const detail = await agent.get(`/api/broadcasts/${id}`);
      expect((detail.body as BroadcastView).game).toEqual(LOL_GAME);
    });

    it('stores a typed-in game name, trimmed, with no qid', async () => {
      const { agent } = await signUpAndLogIn(app);
      const res = await agent.post('/api/broadcasts').send({
        title: '추억의 게임',
        category: 'GAME',
        gameName: '  카트라이더 슈퍼러쉬  ',
      });
      expect(res.status).toBe(201);
      expect((res.body as BroadcastView).game).toEqual({
        qid: null,
        name: '카트라이더 슈퍼러쉬',
      });
    });

    it('lets a GAME broadcast go without a game', async () => {
      const { agent } = await signUpAndLogIn(app);
      const res = await agent.post('/api/broadcasts').send({
        title: '게임 방송',
        category: 'GAME',
        gameQid: null,
        gameName: null,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ category: 'GAME', game: null });
    });

    it('stores the category sent', async () => {
      const { agent } = await signUpAndLogIn(app);
      const res = await agent
        .post('/api/broadcasts')
        .send({ title: '노래 방송', category: 'MUSIC' });
      expect(res.status).toBe(201);
      expect((res.body as BroadcastView).category).toBe('MUSIC');
    });

    it('defaults the description to an empty string', async () => {
      const { agent } = await signUpAndLogIn(app);
      const res = await agent.post('/api/broadcasts').send({ title: '제목만' });
      expect(res.status).toBe(201);
      expect((res.body as BroadcastView).description).toBe('');
    });

    it.each<[string, object]>([
      ['a missing title', {}],
      ['a blank title', { title: '   ' }],
      ['a title over 100 characters', { title: 'a'.repeat(101) }],
      [
        'a description over 2000 characters',
        { title: 'ok', description: 'a'.repeat(2001) },
      ],
      ['an unknown category', { title: 'ok', category: 'COOKING' }],
      ['a lowercase category', { title: 'ok', category: 'music' }],
      ['a non-string category', { title: 'ok', category: 1 }],
      [
        'a qid missing from the game list',
        { title: 'ok', category: 'GAME', gameQid: 'Q999999' },
      ],
      ...['223341', 'Q0', 'Q01', 'q223341', 'Q223341 ', 'Q-1'].map(
        (gameQid) =>
          [
            `a malformed qid ${JSON.stringify(gameQid)}`,
            { title: 'ok', category: 'GAME', gameQid },
          ] satisfies [string, object],
      ),
      ['a blank game name', { title: 'ok', category: 'GAME', gameName: '   ' }],
      [
        'a game name over 50 characters',
        { title: 'ok', category: 'GAME', gameName: 'a'.repeat(51) },
      ],
      [
        'a non-string game name',
        { title: 'ok', category: 'GAME', gameName: 1 },
      ],
      [
        'a game on a MUSIC broadcast',
        { title: 'ok', category: 'MUSIC', gameName: '롤' },
      ],
      [
        'a listed game on a TALK broadcast',
        { title: 'ok', category: 'TALK', gameQid: 'Q223341' },
      ],
      ['a game with no category', { title: 'ok', gameName: '롤' }],
    ])('rejects %s with 400', async (_case, body) => {
      const { agent } = await signUpAndLogIn(app);
      const res = await agent.post('/api/broadcasts').send(body);
      expect(res.status).toBe(400);
      expect(await prisma.broadcast.count()).toBe(0);
    });
  });

  describe('GET /api/broadcasts', () => {
    // 주입한 시계 기준이다. READY_LISTED_MS도 이 시계로 잰다.
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

  it.each([
    ['GET /api/broadcasts', () => '/api/broadcasts'],
    ['GET /api/broadcasts/:id', (id: string) => `/api/broadcasts/${id}`],
    ['GET /api/replays', () => '/api/replays'],
    ['GET /api/me/broadcasts', () => '/api/me/broadcasts'],
    [
      'GET /api/streamers/:id/broadcasts',
      (_id: string, streamerId: string) =>
        `/api/streamers/${streamerId}/broadcasts`,
    ],
  ])('%s shows the broadcast’s category', async (_case, path) => {
    const { user, agent } = await signUpAndLogIn(app);
    const id = await seed(user, '축구 중계', 'ENDED');
    await prisma.broadcast.update({
      where: { id },
      data: { category: 'SPORTS', recordingFiles: [`${id}/1_0.mp4`] },
    });

    const res = await agent.get(path(id, user.id));
    expect(res.status).toBe(200);
    const body = res.body as BroadcastView | BroadcastView[];
    const found = Array.isArray(body) ? body.find((b) => b.id === id) : body;
    expect(found?.category).toBe('SPORTS');
  });

  it.each([
    ['GET /api/broadcasts', () => '/api/broadcasts'],
    ['GET /api/broadcasts/:id', (id: string) => `/api/broadcasts/${id}`],
    ['GET /api/replays', () => '/api/replays'],
    ['GET /api/me/broadcasts', () => '/api/me/broadcasts'],
    [
      'GET /api/streamers/:id/broadcasts',
      (_id: string, streamerId: string) =>
        `/api/streamers/${streamerId}/broadcasts`,
    ],
  ])(
    '%s shows the game as {qid, name} and not the stored columns',
    async (_case, path) => {
      const { user, agent } = await signUpAndLogIn(app);
      const listed = await seed(user, '랭크', 'ENDED');
      const typed = await seed(user, '추억', 'ENDED');
      const none = await seed(user, '잡담', 'ENDED');
      await prisma.broadcast.update({
        where: { id: listed },
        data: {
          category: 'GAME',
          gameQid: 'Q223341',
          gameName: '리그 오브 레전드',
        },
      });
      await prisma.broadcast.update({
        where: { id: typed },
        data: { category: 'GAME', gameName: '카트라이더 슈퍼러쉬' },
      });
      await prisma.broadcast.updateMany({
        data: { recordingFiles: ['x/1_0.mp4'] },
      });

      const games = new Map<string, unknown>();
      for (const id of [listed, typed, none]) {
        const res = await agent.get(path(id, user.id));
        expect(res.status).toBe(200);
        const body = res.body as BroadcastView | BroadcastView[];
        const found = Array.isArray(body)
          ? body.find((b) => b.id === id)
          : body;
        expect(found).not.toHaveProperty('gameQid');
        expect(found).not.toHaveProperty('gameName');
        games.set(id, found?.game);
      }
      expect(games.get(listed)).toEqual(LOL_GAME);
      expect(games.get(typed)).toEqual({
        qid: null,
        name: '카트라이더 슈퍼러쉬',
      });
      expect(games.get(none)).toBeNull();
    },
  );

  // PATCH와 DELETE를 누가 호출할 수 있는지는 authorization-matrix.e2e.spec.ts에서 다룬다.
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

    it('changes only the category when that is all that is sent', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '원래 제목', 'LIVE');

      const res = await agent
        .patch(`/api/broadcasts/${id}`)
        .send({ category: 'GAME' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        title: '원래 제목',
        description: '',
        category: 'GAME',
        status: 'LIVE',
      });
    });

    async function seedGameBroadcast(user: TestUser, status: Status = 'LIVE') {
      const id = await seed(user, '게임 방송', status);
      await prisma.broadcast.update({
        where: { id },
        data: {
          category: 'GAME',
          gameQid: 'Q223341',
          gameName: '리그 오브 레전드',
        },
      });
      return id;
    }

    it('sets the game of a GAME broadcast without resending the category', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '원래 제목', 'LIVE');
      await prisma.broadcast.update({
        where: { id },
        data: { category: 'GAME' },
      });

      const res = await agent
        .patch(`/api/broadcasts/${id}`)
        .send({ gameQid: 'Q223341', gameName: '아무거나' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ category: 'GAME', game: LOL_GAME });
    });

    it('switches a listed game to a typed-in one', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seedGameBroadcast(user);
      const res = await agent
        .patch(`/api/broadcasts/${id}`)
        .send({ gameName: '카트라이더 슈퍼러쉬' });
      expect(res.status).toBe(200);
      expect((res.body as BroadcastView).game).toEqual({
        qid: null,
        name: '카트라이더 슈퍼러쉬',
      });
    });

    it.each<[string, object]>([
      ['both game fields are null', { gameQid: null, gameName: null }],
      ['only the qid is null', { gameQid: null }],
      ['only the name is null', { gameName: null }],
    ])('clears the game when %s', async (_case, body) => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seedGameBroadcast(user);
      const res = await agent.patch(`/api/broadcasts/${id}`).send(body);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ category: 'GAME', game: null });
    });

    it('keeps the game when the game fields are left out', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seedGameBroadcast(user);
      const res = await agent
        .patch(`/api/broadcasts/${id}`)
        .send({ title: '새 제목', category: 'GAME' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ title: '새 제목', game: LOL_GAME });
    });

    it.each<Status>(['READY', 'LIVE', 'ENDED'])(
      'clears the game of a %s broadcast moved from GAME to MUSIC',
      async (status) => {
        const { user, agent } = await signUpAndLogIn(app);
        const id = await seedGameBroadcast(user, status);
        const res = await agent
          .patch(`/api/broadcasts/${id}`)
          .send({ category: 'MUSIC' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ category: 'MUSIC', game: null });
        const detail = await agent.get(`/api/broadcasts/${id}`);
        expect(detail.body).toMatchObject({ category: 'MUSIC', game: null });
      },
    );

    it('rejects a game on a stored MUSIC broadcast with 400 and changes nothing', async () => {
      const { user, agent } = await signUpAndLogIn(app);
      const id = await seed(user, '원래 제목', 'LIVE');
      await prisma.broadcast.update({
        where: { id },
        data: { category: 'MUSIC' },
      });
      const before = await prisma.broadcast.findUniqueOrThrow({
        where: { id },
      });

      const res = await agent
        .patch(`/api/broadcasts/${id}`)
        .send({ title: '새 제목', gameName: '롤' });
      expect(res.status).toBe(400);
      expect(
        await prisma.broadcast.findUniqueOrThrow({ where: { id } }),
      ).toEqual(before);
    });

    it.each([
      ['an empty body', {}],
      ['only unknown fields', { status: 'ENDED' }],
      ['a blank title', { title: '   ' }],
      ['a title over 100 characters', { title: 'a'.repeat(101) }],
      ['a description over 2000 characters', { description: 'a'.repeat(2001) }],
      ['a non-string title', { title: 42 }],
      ['an unknown category', { category: 'COOKING' }],
      ['a non-string category', { category: 1 }],
      [
        'a qid missing from the game list',
        { category: 'GAME', gameQid: 'Q999999' },
      ],
      ['a malformed qid', { category: 'GAME', gameQid: 'Q01' }],
      ['a blank game name', { category: 'GAME', gameName: '  ' }],
      ['a game while moving to TALK', { category: 'TALK', gameQid: 'Q223341' }],
      ['a game on a stored ETC broadcast', { gameName: '롤' }],
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
      // 연결 끊기가 성공했을 때만 그 뒤에 녹화 중지가 온다.
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
