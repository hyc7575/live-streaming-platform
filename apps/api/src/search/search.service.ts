import { Inject, Injectable } from '@nestjs/common';
import {
  BroadcastsService,
  READY_LISTED_MS,
  type BroadcastView,
} from '../broadcasts/broadcasts.service.js';
import { CLOCK, type Clock } from '../clock.js';
import { PrismaService } from '../database/database.module.js';
import { escapeLike } from '../games/games.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  StreamersService,
  type StreamerProfile,
} from '../streamers/streamers.service.js';

export const SEARCH_STREAMER_LIMIT = 10;
export const SEARCH_BROADCAST_LIMIT = 30;

export type SearchStreamer = Omit<StreamerProfile, 'bio'>;

// GET /search. 방송은 지금 볼 수 있는 것(LIVE·READY)과 끝난 것(ENDED)으로
// 나눈다(PRD-search 7.2).
export interface SearchResult {
  streamers: SearchStreamer[];
  broadcasts: BroadcastView[];
  past: BroadcastView[];
}

// foldGameText와 같은 접기(공백을 모두 빼고 소문자)를 SQL에서 한다.
function fold(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`regexp_replace(lower(${column}), '\\s', '', 'g')`;
}

const title = fold(Prisma.sql`b."title"`);
const nickname = fold(Prisma.sql`u."nickname"`);
const gameName = fold(Prisma.sql`b."gameName"`);

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcasts: BroadcastsService,
    private readonly streamers: StreamersService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // folded는 foldGameText를 거친 검색어다. 인덱스 없이 훑는다. 방송이 수백 개
  // 규모라 충분하다(PRD-search 7.1).
  async search(folded: string): Promise<SearchResult> {
    const listedSince = new Date(this.clock.now().getTime() - READY_LISTED_MS);
    const p = escapeLike(folded);
    const contains = `%${p}%`;
    // 별칭은 searchText의 토큰과 완전히 같을 때만 맞는다. 부분 일치로 보면
    // "롤" 하나가 게임 수십 개의 별칭에 걸린다(DISCOVERY-search E2).
    const matches = Prisma.sql`(
      ${title} LIKE ${contains} ESCAPE '\\'
      OR ${nickname} LIKE ${contains} ESCAPE '\\'
      OR ${gameName} LIKE ${contains} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM "Game" g
        WHERE g."qid" = b."gameQid"
          AND ' ' || g."searchText" || ' ' LIKE ${`% ${p} %`} ESCAPE '\\'
      )
    )`;
    // 공개 목록과 같은 범위다(BroadcastsService.listPublic).
    const listed = Prisma.sql`(
      b."status" IN ('LIVE', 'ENDED')
      OR (b."status" = 'READY' AND b."createdAt" > ${listedSince})
    )`;

    const [streamerIds, liveIds, pastIds] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT u."id"
        FROM "User" u
        WHERE ${nickname} LIKE ${contains} ESCAPE '\\'
          AND EXISTS (
            SELECT 1 FROM "Broadcast" b
            WHERE b."streamerId" = u."id" AND ${listed}
          )
        ORDER BY
          CASE
            WHEN ${nickname} = ${folded} THEN 0
            WHEN ${nickname} LIKE ${`${p}%`} ESCAPE '\\' THEN 1
            ELSE 2
          END,
          (SELECT count(*) FROM "Follow" f WHERE f."streamerId" = u."id") DESC,
          u."nickname",
          u."id"
        LIMIT ${SEARCH_STREAMER_LIMIT}`),
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT b."id"
        FROM "Broadcast" b JOIN "User" u ON u."id" = b."streamerId"
        WHERE b."status" IN ('LIVE', 'READY') AND ${listed} AND ${matches}
        ORDER BY
          b."status" = 'LIVE' DESC,
          b."startedAt" DESC NULLS LAST,
          b."createdAt" DESC,
          b."id"
        LIMIT ${SEARCH_BROADCAST_LIMIT}`),
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT b."id"
        FROM "Broadcast" b JOIN "User" u ON u."id" = b."streamerId"
        WHERE b."status" = 'ENDED' AND ${matches}
        ORDER BY b."endedAt" DESC NULLS LAST, b."createdAt" DESC, b."id"
        LIMIT ${SEARCH_BROADCAST_LIMIT}`),
    ]);

    const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
    const [profiles, broadcasts, past] = await Promise.all([
      this.streamers.profiles(ids(streamerIds)),
      this.broadcasts.viewsByIds(ids(liveIds)),
      this.broadcasts.viewsByIds(ids(pastIds)),
    ]);
    return {
      // 소개는 채널 페이지에서만 보인다.
      streamers: profiles.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl,
        followerCount: p.followerCount,
        liveBroadcastId: p.liveBroadcastId,
      })),
      broadcasts,
      past,
    };
  }
}
