import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../database/database.module.js';
import { Prisma, type BroadcastStatus } from '../generated/prisma/client.js';
import { OME_API, type OmeApi } from '../ome/ome-api.js';

export interface CreateBroadcastInput {
  title: string;
  description: string;
}

export interface UpdateBroadcastInput {
  title?: string | undefined;
  description?: string | undefined;
}

export const END_READY_MESSAGE =
  '아직 시작하지 않은 방송은 종료할 수 없습니다.';
export const DROP_STREAM_FAILED_MESSAGE =
  '송출 연결을 끊지 못했습니다. 다시 시도하세요.';

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
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OME_API) private readonly ome: OmeApi,
  ) {}

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

  // PRD §7.4: the database turns ENDED before OME drops the stream, so a
  // publisher reconnecting in between is refused by the admission webhook.
  // The reverse order would let it slip back in. An ENDED broadcast still
  // gets the drop, so a retry after a failed drop converges.
  async end(id: string): Promise<BroadcastView> {
    await this.prisma.broadcast.updateMany({
      where: { id, status: 'LIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    const broadcast = await this.get(id);
    // §7.4 has no READY → ENDED edge. A READY broadcast is deleted instead.
    if (broadcast.status === 'READY') {
      throw new ConflictException(END_READY_MESSAGE);
    }
    try {
      await this.ome.dropStream(id);
    } catch (error) {
      this.logger.error(`Dropping the stream of ${id} failed`, error);
      throw new BadGatewayException(DROP_STREAM_FAILED_MESSAGE);
    }
    return broadcast;
  }

  // A READY broadcast never had a stream, so it is deleted outright. Any
  // other is ended first, which also retries the stream drop of an ENDED
  // broadcast whose earlier drop failed. Once a broadcast leaves READY it
  // never returns, so the filtered delete cannot race the end.
  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.broadcast.deleteMany({
      where: { id, status: 'READY' },
    });
    if (count === 1) return;
    await this.end(id);
    await this.prisma.broadcast.deleteMany({ where: { id } });
  }
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}
