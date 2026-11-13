import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import { PrismaService } from '../database/database.module.js';
import { Prisma, type BroadcastStatus } from '../generated/prisma/client.js';
import {
  ImageStore,
  userImageUrl,
  thumbnailUrl,
} from '../images/image-store.js';
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
export const THUMBNAIL_NOT_LIVE_MESSAGE =
  '방송 중일 때만 썸네일을 올릴 수 있습니다.';

export type PublicStatus = Extract<BroadcastStatus, 'LIVE' | 'READY' | 'ENDED'>;

// What the API reveals about a broadcast. The streamer appears by nickname
// only, never by email.
const broadcastSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  startedAt: true,
  endedAt: true,
  disconnectedAt: true,
  createdAt: true,
  recordingFiles: true,
  recordingStartedAt: true,
  thumbnailUpdatedAt: true,
  streamer: {
    select: {
      id: true,
      nickname: true,
      standbyImageExt: true,
      standbyImageUpdatedAt: true,
    },
  },
} as const satisfies Prisma.BroadcastSelect;

type BroadcastRow = Prisma.BroadcastGetPayload<{
  select: typeof broadcastSelect;
}>;

// startedAt is the moment the part's video at 0 s shows. It is null for
// every part when any part's start is unknown.
export interface RecordingPart {
  file: string;
  startedAt: Date | null;
}

// Upload times and extensions only exist to build URLs, so clients get the
// URLs. The standby image is the streamer's, shared by all their broadcasts.
export type BroadcastView = Omit<
  BroadcastRow,
  'recordingStartedAt' | 'thumbnailUpdatedAt' | 'streamer'
> & {
  recordingParts: RecordingPart[];
  streamer: { id: string; nickname: string };
  thumbnailUrl: string | null;
  standbyImageUrl: string | null;
};

function toView({
  recordingStartedAt,
  thumbnailUpdatedAt,
  streamer: { standbyImageExt, standbyImageUpdatedAt, ...streamer },
  ...row
}: BroadcastRow): BroadcastView {
  return {
    ...row,
    recordingParts: row.recordingFiles.map((file, i) => ({
      file,
      startedAt: recordingStartedAt[i] ?? null,
    })),
    streamer,
    thumbnailUrl: thumbnailUrl(row.id, thumbnailUpdatedAt),
    standbyImageUrl: userImageUrl(
      streamer.id,
      'standby',
      standbyImageExt,
      standbyImageUpdatedAt,
    ),
  };
}

// No pagination: one contest-scale deployment holds tens of broadcasts, so a
// fixed cap keeps the response bounded without a cursor API.
export const PUBLIC_LIST_LIMIT = 100;

// List order. The enum declares READY first, so ordering by status cannot
// give this.
const PUBLIC_STATUSES = [
  'LIVE',
  'READY',
  'ENDED',
] as const satisfies readonly PublicStatus[];

// A READY broadcast is listed for a day after creation so viewers can gather
// before it starts. Abandoned ones drop out of the list but are never ended
// or deleted.
export const READY_LISTED_MS = 24 * 60 * 60 * 1000;

const uuid = z.uuid();

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OME_API) private readonly ome: OmeApi,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly images: ImageStore,
  ) {}

  async create(
    streamerId: string,
    input: CreateBroadcastInput,
  ): Promise<BroadcastView> {
    return toView(
      await this.prisma.broadcast.create({
        data: { ...input, streamerId },
        select: broadcastSelect,
      }),
    );
  }

  // The public list, or one streamer's part of it for their channel page:
  // both follow the same status rules.
  async listPublic({
    status,
    streamerId,
  }: { status?: PublicStatus; streamerId?: string } = {}): Promise<
    BroadcastView[]
  > {
    const listedSince = new Date(this.clock.now().getTime() - READY_LISTED_MS);
    const groups = await Promise.all(
      (status ? [status] : PUBLIC_STATUSES).map((s) =>
        this.prisma.broadcast.findMany({
          where:
            s === 'READY'
              ? { streamerId, status: s, createdAt: { gt: listedSince } }
              : { streamerId, status: s },
          orderBy: [
            { startedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
          take: PUBLIC_LIST_LIMIT,
          select: broadcastSelect,
        }),
      ),
    );
    return groups.flat().slice(0, PUBLIC_LIST_LIMIT).map(toView);
  }

  async listReplays(): Promise<BroadcastView[]> {
    const rows = await this.prisma.broadcast.findMany({
      where: { status: 'ENDED', recordingFiles: { isEmpty: false } },
      orderBy: { endedAt: 'desc' },
      take: PUBLIC_LIST_LIMIT,
      select: broadcastSelect,
    });
    return rows.map(toView);
  }

  async listByStreamer(streamerId: string): Promise<BroadcastView[]> {
    const rows = await this.prisma.broadcast.findMany({
      where: { streamerId },
      orderBy: { createdAt: 'desc' },
      select: broadcastSelect,
    });
    return rows.map(toView);
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
    return toView(broadcast);
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
      return toView(
        await this.prisma.broadcast.update({
          where: { id },
          data: input,
          select: broadcastSelect,
        }),
      );
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
  // gets the drop, so a retry after a failed drop converges. Stopping the
  // recording comes last and may fail: RecordingReconciler stops any task
  // whose broadcast is no longer LIVE.
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
    try {
      await this.ome.stopRecord(id);
    } catch (error) {
      this.logger.error(`Stopping the recording of ${id} failed`, error);
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
    if (count === 0) {
      await this.end(id);
      await this.prisma.broadcast.deleteMany({ where: { id } });
    }
    // The broadcast is already gone, so a leftover folder is only disk space
    // and not worth failing the delete over.
    try {
      await this.images.removeThumbnail(id);
    } catch (error) {
      this.logger.error(`Removing the thumbnail of ${id} failed`, error);
    }
  }

  // The update repeats the LIVE check so a broadcast that ends mid-upload
  // keeps its time. Its file may still be replaced, which only shows a
  // slightly newer frame under the old URL.
  async saveThumbnail(id: string, bytes: Uint8Array): Promise<void> {
    const { status } = await this.get(id);
    if (status !== 'LIVE') {
      throw new ConflictException(THUMBNAIL_NOT_LIVE_MESSAGE);
    }
    await this.images.writeThumbnail(id, bytes);
    await this.prisma.broadcast.updateMany({
      where: { id, status: 'LIVE' },
      data: { thumbnailUpdatedAt: this.clock.now() },
    });
  }
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}
