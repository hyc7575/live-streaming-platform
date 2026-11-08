import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../database/database.module.js';
import { Prisma, type BroadcastStatus } from '../generated/prisma/client.js';

export interface CreateBroadcastInput {
  title: string;
  description: string;
}

export interface UpdateBroadcastInput {
  title?: string | undefined;
  description?: string | undefined;
}

export const DELETE_LIVE_MESSAGE = '방송을 종료한 뒤 삭제하세요.';

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

  async streamerIdOf(id: string): Promise<string> {
    const broadcast = uuid.safeParse(id).success
      ? await this.prisma.broadcast.findUnique({
          where: { id },
          select: { streamerId: true },
        })
      : null;
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    return broadcast.streamerId;
  }

  // Title and description are not part of the status lifecycle, so every
  // status, LIVE included, accepts an edit.
  async update(
    id: string,
    input: UpdateBroadcastInput,
  ): Promise<BroadcastView> {
    try {
      return await this.prisma.broadcast.update({
        where: { id },
        data: input,
        select: broadcastSelect,
      });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new NotFoundException('Broadcast not found');
      }
      throw error;
    }
  }

  // PRD 7.4 wants a LIVE delete to end the broadcast first. Ending it means
  // cutting the publish connection on the media server, which lands with the
  // end-broadcast issue (#11), so until then a LIVE delete is refused. The
  // status filter sits in the DELETE itself, so a broadcast that goes LIVE
  // between the ownership check and here is still refused.
  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.broadcast.deleteMany({
      where: { id, status: { not: 'LIVE' } },
    });
    if (count === 1) return;
    const exists = await this.prisma.broadcast.count({ where: { id } });
    if (exists === 0) throw new NotFoundException('Broadcast not found');
    throw new ConflictException(DELETE_LIVE_MESSAGE);
  }
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}
