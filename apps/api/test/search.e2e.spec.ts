import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  READY_LISTED_MS,
  type BroadcastView,
} from '../src/broadcasts/broadcasts.service.js';
import { PrismaService } from '../src/database/database.module.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import { seedGames, type GameRecord } from '../src/games/seed-games.js';
import {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_RATE_LIMIT,
} from '../src/search/search.controller.js';
import type { SearchResult } from '../src/search/search.service.js';
import {
  createTestApp,
  newClientIp,
  resetDatabase,
  signUp,
  type TestUser,
} from './support/app.js';
import { fakeClockOf, type FakeClock } from './support/fake-clock.js';

const LOL: GameRecord = {
  qid: 'Q223341',
  nameKo: '리그 오브 레전드',
  nameEn: 'League of Legends',
  aliasesKo: ['롤', 'LOL', '리그오브레전드'],
};
// 별칭에만 "롤"이 들어 있는 게임. 별칭은 완전 일치로만 찾는다.
const BREAKER: GameRecord = {
  qid: 'Q9',
  nameKo: '브레이크아웃',
  nameEn: null,
  aliasesKo: ['롤브레이커'],
};

// PRD-search 7.1·7.2: 로그인 없이 제목·닉네임·게임으로 공개 방송과
// 스트리머를 찾는다.
describe('GET /api/search', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clock: FakeClock;
  let streamer: TestUser;

  const ago = (ms: number) => new Date(clock.now().getTime() - ms);

  const get = (q?: string) =>
    request(app.getHttpServer())
      .get('/api/search')
      .set('X-Forwarded-For', newClientIp())
      .query(q === undefined ? {} : { q });

  const search = async (q: string) => {
    const res = await get(q);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as SearchResult;
  };

  const titles = (list: BroadcastView[]) => list.map((b) => b.title);

  const seed = async (
    streamerId: string,
    title: string,
    status: BroadcastStatus,
    {
      createdAt = ago(60_000),
      game,
    }: { createdAt?: Date; game?: GameRecord } = {},
  ) =>
    (
      await prisma.broadcast.create({
        data: {
          streamerId,
          title,
          status,
          createdAt,
          startedAt: status === 'READY' ? null : createdAt,
          endedAt: status === 'ENDED' ? createdAt : null,
          ...(game && {
            category: 'GAME',
            gameQid: game.qid,
            gameName: game.nameKo,
          }),
        },
      })
    ).id;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    clock = fakeClockOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await seedGames(prisma, [LOL, BREAKER]);
    streamer = await signUp(app, { nickname: '불씨' });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['too long', 'a'.repeat(SEARCH_QUERY_MAX_LENGTH + 1)],
  ])('rejects a %s query with 400', async (_name, q) => {
    expect((await get(q)).status).toBe(400);
  });

  it('accepts a query of the maximum length after trimming', async () => {
    const res = await get(`  ${'a'.repeat(SEARCH_QUERY_MAX_LENGTH)}  `);
    expect(res.status).toBe(200);
  });

  it('answers an anonymous caller with streamers and broadcasts, never emails or bios', async () => {
    const live = await seed(streamer.id, '저녁 방송', 'LIVE');
    const body = await search('불씨');
    expect(body.streamers).toEqual([
      {
        id: streamer.id,
        nickname: '불씨',
        avatarUrl: null,
        followerCount: 0,
        liveBroadcastId: live,
      },
    ]);
    expect(titles(body.broadcasts)).toEqual(['저녁 방송']);
    expect(body.past).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('@');
  });

  it('matches title, nickname and game name in part, ignoring spaces and case', async () => {
    await seed(streamer.id, '리그 오브 레전드 랭크', 'LIVE');
    await seed(streamer.id, 'LoL 내전', 'ENDED');
    await seed(streamer.id, '아무 제목', 'ENDED', { game: LOL });

    expect(titles((await search('리그오브')).broadcasts)).toEqual([
      '리그 오브 레전드 랭크',
    ]);
    expect(titles((await search('리그오브')).past)).toEqual(['아무 제목']);
    expect(titles((await search('LOL내전')).past)).toEqual(['LoL 내전']);
    expect(titles((await search('불')).past)).toHaveLength(2);
  });

  it('finds a game broadcast by an exact alias, but not by part of one', async () => {
    await seed(streamer.id, '랭크 돌린다', 'ENDED', { game: LOL });
    await seed(streamer.id, '고전 게임', 'ENDED', { game: BREAKER });

    expect(titles((await search('롤')).past)).toEqual(['랭크 돌린다']);
    expect(titles((await search('롤브레이커')).past)).toEqual(['고전 게임']);
  });

  it('covers the public list only: READY for a day, and streamers with a listed broadcast', async () => {
    const quiet = await signUp(app, { nickname: '불씨팬' });
    const idle = await signUp(app, { nickname: '불씨구경' });
    await seed(streamer.id, '불꽃 준비', 'READY');
    await seed(quiet.id, '불꽃 버려진 준비', 'READY', {
      createdAt: ago(READY_LISTED_MS),
    });

    const body = await search('불');
    expect(titles(body.broadcasts)).toEqual(['불꽃 준비']);
    expect(body.streamers.map((s) => s.id)).toEqual([streamer.id]);
    expect(JSON.stringify(body)).not.toContain(idle.id);
  });

  it('puts LIVE before READY, and the most recently ended first', async () => {
    await seed(streamer.id, '방송 준비', 'READY', { createdAt: ago(1_000) });
    await seed(streamer.id, '방송 중', 'LIVE', { createdAt: ago(9_000) });
    await seed(streamer.id, '방송 오래전', 'ENDED', { createdAt: ago(50_000) });
    await seed(streamer.id, '방송 어제', 'ENDED', { createdAt: ago(20_000) });

    const body = await search('방송');
    expect(titles(body.broadcasts)).toEqual(['방송 중', '방송 준비']);
    expect(titles(body.past)).toEqual(['방송 어제', '방송 오래전']);
  });

  it('ranks streamers by exact, then prefix, then partial nickname match', async () => {
    const inner = await signUp(app, { nickname: '작은불씨' });
    const prefix = await signUp(app, { nickname: '불씨네' });
    for (const id of [inner.id, prefix.id, streamer.id]) {
      await seed(id, '방송', 'ENDED');
    }

    const body = await search('불씨');
    expect(body.streamers.map((s) => s.id)).toEqual([
      streamer.id,
      prefix.id,
      inner.id,
    ]);
  });

  it('treats % and _ in the query as plain characters', async () => {
    await seed(streamer.id, '달성률 100%', 'ENDED');
    await seed(streamer.id, 'snake_case 강의', 'ENDED');
    await seed(streamer.id, '그냥 방송', 'ENDED');

    expect(titles((await search('%')).past)).toEqual(['달성률 100%']);
    expect(titles((await search('_')).past)).toEqual(['snake_case 강의']);
  });

  it('answers 429 once one client exceeds the search limit', async () => {
    const ip = newClientIp();
    const attempt = () =>
      request(app.getHttpServer())
        .get('/api/search')
        .set('X-Forwarded-For', ip)
        .query({ q: '불씨' });
    for (let i = 0; i < SEARCH_RATE_LIMIT.limit; i += 1) {
      expect((await attempt()).status).toBe(200);
    }
    expect((await attempt()).status).toBe(429);
  });
});
