import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  BroadcastLifecycle,
  type GoLiveResult,
  type ReconnectResult,
} from '../broadcasts/broadcast-lifecycle.js';
import { CLOCK, type Clock } from '../clock.js';
import { PrismaService } from '../database/database.module.js';
import {
  decideAdmission,
  publishPath,
  type AdmissionDecision,
  type PublishTarget,
} from './admission.js';
import { PUBLISH_CONFIG, type PublishConfig } from './publish-config.js';
import {
  mintPublishToken,
  verifyPublishToken,
  type PublishClient,
} from './publish-token.js';

export const OTHER_LIVE_MESSAGE = '기존 방송을 종료하세요.';
export const ENDED_PUBLISH_MESSAGE =
  '종료된 방송은 다시 송출할 수 없습니다. 새 방송을 만드세요.';

export interface PublishTicket {
  // 같은 origin 경로. 웹 앱과 OME가 한 origin 뒤에 있다(개발에서는 Vite proxy,
  // 운영에서는 Caddy).
  publishUrl: string;
  expiresAt: Date;
}

const uuid = z.uuid();

@Injectable()
export class PublishService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUBLISH_CONFIG) private readonly config: PublishConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly lifecycle: BroadcastLifecycle,
  ) {}

  // 호출자는 이미 BroadcastOwnerGuard를 통과했다. 그래서 방송이 있고
  // `streamerId`의 것이다.
  async issue(
    broadcastId: string,
    streamerId: string,
    client: PublishClient,
  ): Promise<PublishTicket> {
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
      client,
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
      // 판정이 고른 전이는 BroadcastLifecycle이 조건부 쓰기로 한다. 판정과
      // 같은 `now`를 넘겨 startedAt과 유예 경계가 판정 시각과 같다. 그사이
      // 상태가 바뀌면 쓰기 쪽 결과가 이긴다.
      case 'go-live':
        return decisionOf(await this.lifecycle.goLive(target.broadcastId, now));
      case 'reconnect':
        return decisionOf(
          await this.lifecycle.reconnect(target.broadcastId, now),
        );
    }
  }
}

// 전이의 실패 결과는 그대로 송출 허가 거절 사유다.
function decisionOf(result: GoLiveResult | ReconnectResult): AdmissionDecision {
  return result === 'live' || result === 'reconnected'
    ? { allowed: true }
    : { allowed: false, reason: result };
}
