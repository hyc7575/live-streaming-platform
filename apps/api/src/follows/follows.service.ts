import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/database.module.js';
import { Prisma } from '../generated/prisma/client.js';

export const SELF_FOLLOW_MESSAGE = '자기 자신은 팔로우할 수 없습니다.';

// A followed streamer as the follow panel shows them. `live` is the one LIVE
// broadcast the database allows per streamer, or null when offline.
export interface FollowedStreamer {
  id: string;
  nickname: string;
  live: { broadcastId: string; title: string; startedAt: Date } | null;
}

// Enough for the test data; the list has no pagination (PRD-mypage 7.4).
export const FOLLOWER_LIST_LIMIT = 50;

// GET /me/followers. `count` covers every follower, `followers` only the
// newest FOLLOWER_LIST_LIMIT of them. Only the streamer sees the list; the
// public channel page shows the count alone (PRD-mypage 7.2).
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
      // The streamer was deleted between the check and the insert.
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

  // Live streamers first, the latest to go live on top, then the rest by
  // nickname. Prisma cannot order by a filtered relation, so this sorts here.
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
        // A LIVE broadcast always has startedAt; admission sets both at once.
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

  // Unfollow runs the same checks as follow, so the API answers one
  // (follower, streamer) pair the same way whichever verb asks.
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
