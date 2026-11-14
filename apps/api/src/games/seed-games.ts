import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { PrismaService } from '../database/database.module.js';
import { gameSearchText } from './search-text.js';

// Wikidata 항목 id. 방송 본문의 gameQid도 이 형식이다.
export const GAME_QID_PATTERN = /^Q[1-9]\d*$/;

const gameRecord = z.object({
  qid: z.string().regex(GAME_QID_PATTERN),
  nameKo: z.string().min(1),
  nameEn: z.string().nullable(),
  aliasesKo: z.array(z.string()),
});

export type GameRecord = z.infer<typeof gameRecord>;

// games:refresh가 쓰고 커밋하는 스냅샷. src/games와 dist/games 양쪽에서 apps/api/data다.
export const GAMES_FILE = new URL('../../data/games.json', import.meta.url);

async function readGamesFile(path: string | URL): Promise<GameRecord[]> {
  return z
    .array(gameRecord)
    .parse(JSON.parse(await readFile(path, 'utf8')) as unknown);
}

// 파일을 다 읽고 검사한 뒤에야 표를 바꾼다. 그래서 깨진 파일은 기존 목록을 남긴다.
export async function seedGamesFile(
  prisma: PrismaService,
  path: string | URL = GAMES_FILE,
): Promise<number> {
  const games = await readGamesFile(path);
  await seedGames(prisma, games);
  return games.length;
}

// 표를 파일 내용으로 통째로 바꾼다. 그래서 파일에 없는 게임은 사라지고, 같은
// 파일로 다시 돌려도 결과가 같다. 한 트랜잭션이라 검색은 바뀌기 전이나 후의
// 목록만 본다.
export async function seedGames(
  prisma: PrismaService,
  games: GameRecord[],
): Promise<void> {
  await prisma.$transaction([
    prisma.game.deleteMany(),
    prisma.game.createMany({
      data: games.map((game) => ({
        ...game,
        searchText: gameSearchText(game),
      })),
    }),
  ]);
}
