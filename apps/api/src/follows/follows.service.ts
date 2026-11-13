import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/database.module.js';
import { Prisma } from '../generated/prisma/client.js';

export const SELF_FOLLOW_MESSAGE = '자기 자신은 팔로우할 수 없습니다.';

// 팔로우 패널에 보이는 팔로우한 스트리머. `live`는 데이터베이스가 스트리머마다
// 허용하는 단 하나의 LIVE 방송이며, LIVE가 아니면 null이다.
export interface FollowedStreamer {
  id: string;
  nickname: string;
  live: { broadcastId: string; title: string; startedAt: Date } | null;
}

// 테스트 데이터에는 충분하다. 목록에는 페이지네이션이 없다(PRD-mypage 7.4).
export const FOLLOWER_LIST_LIMIT = 50;

// GET /me/followers. `count`는 팔로워 전부를 세고, `followers`는 그중
// 최신 FOLLOWER_LIST_LIMIT명만 담는다. 목록은 스트리머만 본다.
// 공개 채널 페이지는 수만 보여 준다(PRD-mypage 7.2).
export interface FollowerList {
  count: number;
  followers: { id: string; nickname: string; followedAt: Date }[];
}

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  async follow(followerId: string, streamerId: string): Promise<void> {
    await this.checkTarget(followerId, streamerId);
    try {
      await this.prisma.follow.createMany({
        data: { followerId, streamerId },
        skipDuplicates: true,
      });
    } catch (error) {
      // 확인과 삽입 사이에 스트리머가 삭제됐다.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Streamer not found');
      }
      throw error;
    }
  }

  async unfollow(followerId: string, streamerId: string): Promise<void> {
    await this.checkTarget(followerId, streamerId);
    await this.prisma.follow.deleteMany({ where: { followerId, streamerId } });
  }

  // LIVE 방송이 있는 스트리머가 먼저 오고 그중 가장 최근에 방송을 시작한 사람이 맨 위다. 나머지는
  // 닉네임 순이다. Prisma는 필터한 relation으로 정렬할 수 없어 여기서 정렬한다.
  async list(followerId: string): Promise<FollowedStreamer[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId },
      select: {
        streamer: {
          select: {
            id: true,
            nickname: true,
            broadcasts: {
              where: { status: 'LIVE' },
              select: { id: true, title: true, startedAt: true },
              take: 1,
            },
          },
        },
      },
    });
    const streamers = rows.map(({ streamer }): FollowedStreamer => {
      const live = streamer.broadcasts[0];
      return {
        id: streamer.id,
        nickname: streamer.nickname,
        // LIVE 방송에는 항상 startedAt이 있다. 송출 허가가 둘을 한꺼번에 설정한다.
        live:
          live?.startedAt != null
            ? {
                broadcastId: live.id,
                title: live.title,
                startedAt: live.startedAt,
              }
            : null,
      };
    });
    return streamers.sort(compareFollowed);
  }

  async followers(streamerId: string): Promise<FollowerList> {
    const [count, rows] = await Promise.all([
      this.prisma.follow.count({ where: { streamerId } }),
      this.prisma.follow.findMany({
        where: { streamerId },
        orderBy: [{ createdAt: 'desc' }, { followerId: 'desc' }],
        take: FOLLOWER_LIST_LIMIT,
        select: {
          createdAt: true,
          follower: { select: { id: true, nickname: true } },
        },
      }),
    ]);
    return {
      count,
      followers: rows.map(({ createdAt, follower }) => ({
        ...follower,
        followedAt: createdAt,
      })),
    };
  }

  // 언팔로우는 팔로우와 같은 확인을 거친다. 그래서 API는 같은
  // (follower, streamer) 쌍에 어느 동사로 묻든 똑같이 답한다.
  private async checkTarget(
    followerId: string,
    streamerId: string,
  ): Promise<void> {
    if (followerId === streamerId) {
      throw new BadRequestException(SELF_FOLLOW_MESSAGE);
    }
    const streamer = await this.prisma.user.findUnique({
      where: { id: streamerId },
      select: { id: true },
    });
    if (!streamer) throw new NotFoundException('Streamer not found');
  }
}

function compareFollowed(a: FollowedStreamer, b: FollowedStreamer): number {
  if (a.live && b.live) {
    return b.live.startedAt.getTime() - a.live.startedAt.getTime();
  }
  if (a.live) return -1;
  if (b.live) return 1;
  return a.nickname.localeCompare(b.nickname, 'ko');
}
