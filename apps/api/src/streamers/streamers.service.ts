import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BroadcastsService,
  type BroadcastView,
} from '../broadcasts/broadcasts.service.js';
import { PrismaService } from '../database/database.module.js';
import type { Prisma } from '../generated/prisma/client.js';
import { userImageUrl } from '../images/image-store.js';

// GET /streamers/:id. 채널 페이지가 누구에게나 보여 주는 내용. 팔로워는
// 수만 보여 준다. 목록은 스트리머 본인만 본다(PRD-mypage 7.2).
export interface StreamerProfile {
  id: string;
  nickname: string;
  bio: string;
  avatarUrl: string | null;
  followerCount: number;
  // 데이터베이스가 스트리머마다 허용하는 단 하나의 LIVE 방송. 없으면 없다.
  liveBroadcastId: string | null;
}

const profileSelect = {
  id: true,
  nickname: true,
  bio: true,
  avatarExt: true,
  avatarUpdatedAt: true,
  _count: { select: { followers: true } },
  broadcasts: {
    where: { status: 'LIVE' },
    select: { id: true },
    take: 1,
  },
} as const satisfies Prisma.UserSelect;

function toProfile(
  user: Prisma.UserGetPayload<{ select: typeof profileSelect }>,
): StreamerProfile {
  return {
    id: user.id,
    nickname: user.nickname,
    bio: user.bio,
    avatarUrl: userImageUrl(
      user.id,
      'avatar',
      user.avatarExt,
      user.avatarUpdatedAt,
    ),
    followerCount: user._count.followers,
    liveBroadcastId: user.broadcasts[0]?.id ?? null,
  };
}

@Injectable()
export class StreamersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcasts: BroadcastsService,
  ) {}

  async profile(id: string): Promise<StreamerProfile> {
    const [found] = await this.profiles([id]);
    if (!found) throw new NotFoundException('Streamer not found');
    return found;
  }

  // 받은 id 순서를 지킨다. 없는 id는 빠진다. 검색 결과가 순서를 정해 넘긴다.
  async profiles(ids: string[]): Promise<StreamerProfile[]> {
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: profileSelect,
    });
    const byId = new Map(users.map((user) => [user.id, toProfile(user)]));
    return ids.flatMap((id) => {
      const found = byId.get(id);
      return found ? [found] : [];
    });
  }

  async broadcastsOf(id: string): Promise<BroadcastView[]> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Streamer not found');
    return this.broadcasts.listPublic({ streamerId: id });
  }
}
