import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../database/database.module.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  decideAdmission,
  publishPath,
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUBLISH_CONFIG) private readonly config: PublishConfig,
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
      new Date(),
    );
    return { publishUrl: publishPath(broadcastId, token), expiresAt };
  }

  async admit(target: PublishTarget): Promise<AdmissionDecision> {
    const now = new Date();
    const broadcast = uuid.safeParse(target.broadcastId).success
      ? await this.prisma.broadcast.findUnique({
          where: { id: target.broadcastId },
          select: { status: true, streamerId: true },
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
    const decision = decideAdmission(broadcast, token);
    if (!decision.allowed) return decision;
    return this.goLive(target.broadcastId, now);
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
      return count === 1
        ? { allowed: true }
        : { allowed: false, reason: 'broadcast not ready' };
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
}
