import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BroadcastsService,
  type BroadcastView,
} from '../broadcasts/broadcasts.service.js';
import { PrismaService } from '../database/database.module.js';
import { userImageUrl } from '../images/image-store.js';

// GET /streamers/:id, what the channel page shows anyone. Followers are a
// count only: the list is the streamer's own (PRD-mypage 7.2).
export interface StreamerProfile {
  id: string;
  nickname: string;
  bio: string;
  avatarUrl: string | null;
  followerCount: number;
  // The one LIVE broadcast the database allows per streamer, if any.
  liveBroadcastId: string | null;
}

@Injectable()
export class StreamersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcasts: BroadcastsService,
  ) {}

  async profile(id: string): Promise<StreamerProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
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
      },
    });
    if (!user) throw new NotFoundException('Streamer not found');
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

  async broadcastsOf(id: string): Promise<BroadcastView[]> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Streamer not found');
    return this.broadcasts.listPublic({ streamerId: id });
  }
}
