import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import { PrismaService } from '../database/database.module.js';
import { Prisma } from '../generated/prisma/client.js';
import { OME_API, type OmeApi } from '../ome/ome-api.js';
import {
  decideAdmission,
  graceWindow,
  publishPath,
  publishPhaseOf,
  type AdmissionDecision,
  type PublishTarget,
} from './admission.js';
import { PUBLISH_CONFIG, type PublishConfig } from './publish-config.js';
import { mintPublishToken, verifyPublishToken } from './publish-token.js';

export const OTHER_LIVE_MESSAGE = '기존 방송을 종료하세요.';
export const ENDED_PUBLISH_MESSAGE =
  '종료된 방송은 다시 송출할 수 없습니다. 새 방송을 만드세요.';

export interface PublishTicket {
  // Same-origin path: the web app and OME sit behind one origin (Vite proxy
  // in development, Caddy in production).
  publishUrl: string;
  expiresAt: Date;
}

const uuid = z.uuid();

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUBLISH_CONFIG) private readonly config: PublishConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OME_API) private readonly ome: OmeApi,
  ) {}

  // The caller already passed BroadcastOwnerGuard, so the broadcast exists
  // and belongs to `streamerId`.
  async issue(broadcastId: string, streamerId: string): Promise<PublishTicket> {
    const broadcasts = await this.prisma.broadcast.findMany({
      where: {
        streamerId,
        OR: [{ id: broadcastId }, { status: 'LIVE' }],
      },
      select: { id: true, status: true },
    });
    const self = broadcasts.find((b) => b.id === broadcastId);
    if (self?.status === 'ENDED') {
      throw new ConflictException(ENDED_PUBLISH_MESSAGE);
    }
    if (broadcasts.some((b) => b.id !== broadcastId && b.status === 'LIVE')) {
      throw new ConflictException(OTHER_LIVE_MESSAGE);
    }
    const { token, expiresAt } = mintPublishToken(
      this.config.tokenKey,
      { broadcastId, streamerId },
      this.clock.now(),
    );
    return { publishUrl: publishPath(broadcastId, token), expiresAt };
  }

  async admit(target: PublishTarget): Promise<AdmissionDecision> {
    const now = this.clock.now();
    const broadcast = uuid.safeParse(target.broadcastId).success
      ? await this.prisma.broadcast.findUnique({
          where: { id: target.broadcastId },
          select: { status: true, streamerId: true, disconnectedAt: true },
        })
      : null;
    const token =
      target.token === null
        ? 'missing'
        : broadcast &&
            verifyPublishToken(
              this.config.tokenKey,
              target.token,
              {
                broadcastId: target.broadcastId,
                streamerId: broadcast.streamerId,
              },
              now,
            )
          ? 'valid'
          : 'invalid';
    const plan = decideAdmission(broadcast, token, now);
    switch (plan.kind) {
      case 'reject':
        return { allowed: false, reason: plan.reason };
      case 'go-live':
        return this.goLive(target.broadcastId, now);
      case 'reconnect':
        return this.reconnect(target.broadcastId, now);
    }
  }

  async disconnect(broadcastId: string): Promise<boolean> {
    if (!uuid.safeParse(broadcastId).success) return false;
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id: broadcastId, status: 'LIVE', disconnectedAt: null },
      data: { disconnectedAt: this.clock.now() },
    });
    return count === 1;
  }

  // The status filter makes READY → LIVE one conditional write, so two
  // admissions racing for one broadcast let exactly one through. The partial
  // unique index does the same across one streamer's broadcasts.
  private async goLive(id: string, now: Date): Promise<AdmissionDecision> {
    try {
      const { count } = await this.prisma.broadcast.updateMany({
        where: { id, status: 'READY' },
        data: { status: 'LIVE', startedAt: now },
      });
      if (count !== 1) return { allowed: false, reason: 'broadcast not ready' };
      this.startRecording(id);
      return { allowed: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { allowed: false, reason: 'streamer already live' };
      }
      throw error;
    }
  }

  // OME waits at most 3 s for the admission reply and refuses the publish on
  // a timeout, so the reply never waits on the recording request. OME starts
  // a task before its stream exists, and RecordingReconciler retries a
  // failed start.
  private startRecording(id: string): void {
    this.ome
      .startRecord(id)
      .catch((error: unknown) =>
        this.logger.error(`Starting the recording of ${id} failed`, error),
      );
  }

  private async reconnect(id: string, now: Date): Promise<AdmissionDecision> {
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: 'LIVE', disconnectedAt: graceWindow(now).within },
      data: { disconnectedAt: null },
    });
    if (count === 1) return { allowed: true };
    const row = await this.prisma.broadcast.findUnique({
      where: { id },
      select: { status: true, disconnectedAt: true },
    });
    return row && publishPhaseOf(row, now) === 'connected'
      ? { allowed: false, reason: 'broadcast already live' }
      : { allowed: false, reason: 'broadcast ended' };
  }
}
