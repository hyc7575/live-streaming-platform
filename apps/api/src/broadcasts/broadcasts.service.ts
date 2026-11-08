import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../database/database.module.js';
import type { BroadcastStatus, Prisma } from '../generated/prisma/client.js';

export interface CreateBroadcastInput {
  title: string;
  description: string;
}

export type PublicStatus = Extract<BroadcastStatus, 'LIVE' | 'ENDED'>;

// What the API reveals about a broadcast. The streamer appears by nickname
// only, never by email.
const broadcastSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  streamer: { select: { id: true, nickname: true } },
} as const satisfies Prisma.BroadcastSelect;

export type BroadcastView = Prisma.BroadcastGetPayload<{
  select: typeof broadcastSelect;
}>;

// No pagination: one contest-scale deployment holds tens of broadcasts, so a
// fixed cap keeps the response bounded without a cursor API.
export const PUBLIC_LIST_LIMIT = 100;

const PUBLIC_STATUSES: PublicStatus[] = ['LIVE', 'ENDED'];

const uuid = z.uuid();

@Injectable()
export class BroadcastsService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    streamerId: string,
    input: CreateBroadcastInput,
  ): Promise<BroadcastView> {
    return this.prisma.broadcast.create({
      data: { ...input, streamerId },
      select: broadcastSelect,
    });
  }

  listPublic(status?: PublicStatus): Promise<BroadcastView[]> {
    return this.prisma.broadcast.findMany({
      where: { status: status ?? { in: PUBLIC_STATUSES } },
      // Enum declaration order puts LIVE before ENDED.
      orderBy: [
        { status: 'asc' },
        { startedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: PUBLIC_LIST_LIMIT,
      select: broadcastSelect,
    });
  }

  listByStreamer(streamerId: string): Promise<BroadcastView[]> {
    return this.prisma.broadcast.findMany({
      where: { streamerId },
      orderBy: { createdAt: 'desc' },
      select: broadcastSelect,
    });
  }

  // A malformed id names no broadcast, so it gets the same 404 as an unknown
  // one. Checking first also keeps Postgres from rejecting a non-uuid value.
  async get(id: string): Promise<BroadcastView> {
    const broadcast = uuid.safeParse(id).success
      ? await this.prisma.broadcast.findUnique({
          where: { id },
          select: broadcastSelect,
        })
      : null;
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    return broadcast;
  }
}
