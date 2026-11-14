import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/database.module.js';
import {
  GAMES_FILE,
  seedGames,
  seedGamesFile,
  type GameRecord,
} from '../src/games/seed-games.js';
import { createTestApp, resetDatabase, signUpAndLogIn } from './support/app.js';

const LOL: GameRecord = {
  qid: 'Q223341',
  nameKo: '리그 오브 레전드',
  nameEn: 'League of Legends',
  aliasesKo: ['롤', 'LOL', 'League of Legends', '리그오브레전드'],
};

describe('games', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let agent: TestAgent;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ({ agent } = await signUpAndLogIn(app));
  });

  afterAll(async () => {
    await app.close();
  });

  const search = (q: string) => agent.get('/api/games').query({ q });

  describe('GET /api/games', () => {
    it('rejects an anonymous caller with 401', async () => {
      await seedGames(prisma, [LOL]);
      const res = await request(app.getHttpServer())
        .get('/api/games')
        .query({ q: '리그' });
      expect(res.status).toBe(401);
    });

    it('finds a game whose spaced name is typed without spaces', async () => {
      await seedGames(prisma, [LOL]);
      const res = await search('리그오브');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          qid: 'Q223341',
          name: '리그 오브 레전드',
          nameEn: 'League of Legends',
        },
      ]);
    });

    // qid가 작을수록 앞에 오도록 일부러 경쟁 게임에 작은 qid를 준다.
    const RIVALS: GameRecord[] = [
      LOL,
      game('Q1', '롤러코스터 타이쿤', 'RollerCoaster Tycoon'),
      game('Q2', 'Lollipop Chainsaw', 'Lollipop Chainsaw'),
      game('Q3', '카트라이더 러쉬플러스', null, ['카트라이더']),
      game('Q4', '카트라이더'),
      game('Q5', '크레이지 아케이드 카트라이더'),
      game('Q6', '리그 마스터즈'),
      game('Q7', '판타지 리그 매니저'),
    ];

    it.each([
      ['리그오브레전드', 'Q223341'],
      ['리그 오브 레전드', 'Q223341'],
      ['롤', 'Q223341'],
      ['LOL', 'Q223341'],
      ['lol', 'Q223341'],
      ['League of Legends', 'Q223341'],
    ])('puts League of Legends first for %s', async (q, qid) => {
      await seedGames(prisma, RIVALS);
      const res = await search(q);
      expect(res.status).toBe(200);
      expect(qids(res.body)[0]).toBe(qid);
    });

    it('ranks a Korean name match, then an alias match, then a prefix, then a contained match', async () => {
      await seedGames(prisma, RIVALS);
      const res = await search('카트라이더');
      expect(qids(res.body)).toEqual(['Q4', 'Q3', 'Q5']);
    });

    it('ranks prefix matches before contained ones, shorter Korean names first', async () => {
      await seedGames(prisma, RIVALS);
      const res = await search('리그');
      expect(qids(res.body)).toEqual(['Q6', 'Q223341', 'Q7']);
    });

    it('does not match across the boundary between two names', async () => {
      await seedGames(prisma, [game('Q10', '오버워치', 'Overwatch', ['옵치'])]);
      expect((await search('워치옵치')).body).toEqual([]);
      expect((await search('옵치overwatch')).body).toEqual([]);
    });

    it.each([
      ['%', ['Q20']],
      ['_', ['Q21']],
      ['\\', ['Q22']],
    ])('matches %s literally', async (q, expected) => {
      await seedGames(prisma, [
        game('Q20', '100% 오렌지 주스'),
        game('Q21', 'a_b'),
        game('Q22', 'a\\b'),
        game('Q23', '평범한 게임'),
      ]);
      expect(qids((await search(q)).body)).toEqual(expected);
    });

    it('returns at most 10 games', async () => {
      await seedGames(
        prisma,
        Array.from({ length: 12 }, (_, i) => game(`Q${i + 100}`, `게임 ${i}`)),
      );
      const res = await search('게임');
      expect(res.body).toHaveLength(10);
    });

    it.each([
      ['a missing q', undefined],
      ['a blank q', '   '],
      ['a q over 50 characters', 'a'.repeat(51)],
      ['a repeated q', ['리그', '롤']],
    ])('rejects %s with 400', async (_case, q) => {
      await seedGames(prisma, [LOL]);
      const res = await agent
        .get('/api/games')
        .query(q === undefined ? {} : { q });
      expect(res.status).toBe(400);
    });

    it('accepts 50 characters once spaces are removed', async () => {
      const res = await search(`${'a'.repeat(25)}   ${'a'.repeat(25)}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // KR2. E1 검색어 20개(DISCOVERY-broadcast-category.md)와 #133의 표기 변형을
  // 커밋된 실제 목록으로 검색한다. 정답은 games.json에서 그 이름을 가진 게임을
  // 직접 골랐다. 목록을 새로 받아 이 표가 깨지면 순위나 데이터를 다시 본다.
  it('puts the right game first for every E1 search term in the committed list', async () => {
    await seedGamesFile(prisma, GAMES_FILE);
    const expected: Record<string, string> = {
      '리그 오브 레전드': 'Q223341',
      리그오브레전드: 'Q223341',
      롤: 'Q223341',
      LOL: 'Q223341',
      lol: 'Q223341',
      배틀그라운드: 'Q28937399',
      배그: 'Q28937399',
      메이플스토리: 'Q569624',
      로스트아크: 'Q21029108',
      발로란트: 'Q86919275',
      'FC 온라인': 'Q53550949',
      마인크래프트: 'Q49740',
      오버워치: 'Q18515944',
      스타크래프트: 'Q165929',
      '디아블로 4': 'Q73154387',
      던전앤파이터: 'Q484233',
      '엘든 링': 'Q64826862',
      원신: 'Q65059474',
      로블록스: 'Q692989',
      '이터널 리턴': 'Q104541176',
      서든어택: 'Q623421',
      카트라이더: 'Q488178',
      하스스톤: 'Q8262784',
    };
    const first: Record<string, string | undefined> = {};
    for (const q of Object.keys(expected)) {
      first[q] = qids((await search(q)).body)[0];
    }
    expect(first).toEqual(expected);
  });

  describe('seedGames', () => {
    const games = () =>
      prisma.game.findMany({
        orderBy: { qid: 'asc' },
        omit: { updatedAt: true },
      });

    it('updates changed games, adds new ones, and drops games missing from the file', async () => {
      await seedGames(prisma, [LOL, game('Q4', '카트라이더')]);
      await seedGames(prisma, [
        { ...LOL, nameKo: '리그 오브 레전드 2', aliasesKo: ['롤'] },
        game('Q10', '오버워치', 'Overwatch'),
      ]);

      expect(qids((await search('카트라이더')).body)).toEqual([]);
      expect((await search('롤')).body).toEqual([
        {
          qid: 'Q223341',
          name: '리그 오브 레전드 2',
          nameEn: 'League of Legends',
        },
      ]);
      expect((await search('리그오브레전드')).body).toEqual([
        {
          qid: 'Q223341',
          name: '리그 오브 레전드 2',
          nameEn: 'League of Legends',
        },
      ]);
      expect(qids((await search('LOL')).body)).toEqual([]);
      expect(qids((await search('overwatch')).body)).toEqual(['Q10']);
    });

    const writeFile = (content: string) => {
      const path = join(
        mkdtempSync(join(tmpdir(), 'lsp-games-')),
        'games.json',
      );
      writeFileSync(path, content);
      return path;
    };

    it('seeds from a file and reports how many games it holds', async () => {
      const path = writeFile(JSON.stringify([LOL, game('Q4', '카트라이더')]));
      expect(await seedGamesFile(prisma, path)).toBe(2);
      expect(qids((await search('롤')).body)).toEqual(['Q223341']);
    });

    it.each([
      ['a missing file', null],
      ['a file that is not JSON', '[{'],
      ['a game with a malformed qid', JSON.stringify([{ ...LOL, qid: 'L1' }])],
      ['a game with no Korean name', JSON.stringify([{ ...LOL, nameKo: '' }])],
    ])('rejects %s and keeps the existing list', async (_case, content) => {
      await seedGames(prisma, [LOL]);
      const path =
        content === null
          ? join(tmpdir(), 'lsp-no-such-games.json')
          : writeFile(content);
      await expect(seedGamesFile(prisma, path)).rejects.toThrow();
      expect(qids((await search('롤')).body)).toEqual(['Q223341']);
    });

    it('leaves the same table when run twice with the same file', async () => {
      const file = [LOL, game('Q4', '카트라이더'), game('Q10', '오버워치')];
      await seedGames(prisma, file);
      const first = await games();
      await seedGames(prisma, file);
      expect(await games()).toEqual(first);
      expect(first).toHaveLength(3);
    });
  });
});

function game(
  qid: string,
  nameKo: string,
  nameEn: string | null = null,
  aliasesKo: string[] = [],
): GameRecord {
  return { qid, nameKo, nameEn, aliasesKo };
}

function qids(body: unknown): string[] {
  return (body as { qid: string }[]).map((g) => g.qid);
}
