import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/database.module.js';
import { Prisma } from '../generated/prisma/client.js';

export interface GameView {
  qid: string;
  name: string;
  nameEn: string | null;
}

export const GAME_SEARCH_LIMIT = 10;

// LIKE 패턴에서 글자 그대로 찾게 한다. 쿼리가 ESCAPE '\'를 명시한다.
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  // folded는 foldGameText를 거친 검색어다. searchText도 같은 방식으로 접혀 있어
  // 둘 다 소문자이므로 대소문자 구분 LIKE로 충분하다. 순위는 nameKo 완전 일치, 별칭·영어
  // 이름 완전 일치, 어느 이름의 앞부분 일치, 포함 순이고, 같으면 nameKo가 짧은
  // 것이 먼저다. searchText의 첫 토큰이 nameKo다(search-text.ts).
  search(folded: string): Promise<GameView[]> {
    const p = escapeLike(folded);
    return this.prisma.$queryRaw<GameView[]>(Prisma.sql`
      SELECT "qid", "nameKo" AS "name", "nameEn"
      FROM "Game"
      WHERE "searchText" LIKE ${`%${p}%`} ESCAPE '\\'
      ORDER BY
        CASE
          WHEN split_part("searchText", ' ', 1) = ${folded} THEN 0
          WHEN ' ' || "searchText" || ' ' LIKE ${`% ${p} %`} ESCAPE '\\' THEN 1
          WHEN ' ' || "searchText" LIKE ${`% ${p}%`} ESCAPE '\\' THEN 2
          ELSE 3
        END,
        char_length("nameKo"),
        "qid"
      LIMIT ${GAME_SEARCH_LIMIT}`);
  }
}
