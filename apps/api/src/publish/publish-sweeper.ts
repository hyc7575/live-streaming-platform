import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import { PrismaService } from '../database/database.module.js';
import { OME_API, type OmeApi } from '../ome/ome-api.js';
import { graceWindow } from './admission.js';

export const SWEEP_INTERVAL_MS = Symbol('SWEEP_INTERVAL_MS');
export const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

const uuid = z.uuid();

// PRD §7.4 좀비 정리(T8). OME의 `closing`은 빠지거나, 그보다 먼저 와야 할
// 재연결보다 늦게 올 수 있다. 그래서 API가 주기적으로 LIVE 방송을
// OME가 실제로 받고 있는 스트림과 맞춘다.
@Injectable()
export class PublishSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OME_API) private readonly ome: OmeApi,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SWEEP_INTERVAL_MS) private readonly intervalMs: number | null,
  ) {}

  onModuleInit(): void {
    if (this.intervalMs === null) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  private tick(): void {
    if (this.running) return;
    this.running = this.sweep(this.clock.now())
      .catch((error: unknown) => this.logger.error('Sweep failed', error))
      .finally(() => {
        this.running = null;
      });
  }

  async sweep(now: Date): Promise<void> {
    let listed: string[];
    try {
      // Postgres는 uuid 컬럼의 `in` 필터에 uuid가 아닌 값이 있으면 거부한다.
      listed = (await this.ome.listStreams()).filter(
        (name) => uuid.safeParse(name).success,
      );
    } catch (error) {
      this.logger.warn('Skipping the sweep: OME did not list streams', error);
      return;
    }
    const reconnected = await this.prisma.broadcast.updateMany({
      where: {
        status: 'LIVE',
        id: { in: listed },
        // `now` 이후의 끊김은 목록보다 새로울 수 있다. 목록은
        // `now`를 읽은 뒤에 가져왔기 때문이다. 다음 sweep이 정리한다.
        disconnectedAt: { lt: now },
      },
      data: { disconnectedAt: null },
    });
    const lostWithoutClosing = await this.prisma.broadcast.updateMany({
      where: { status: 'LIVE', id: { notIn: listed }, disconnectedAt: null },
      data: { disconnectedAt: now },
    });
    // end()와 달리 OME DELETE를 보내지 않는다. 이 스트림들은 방금 가져온
    // 목록에 없고, ENDED가 저장되면 웹훅이 이후 재연결을 거부한다.
    const ended = await this.prisma.broadcast.updateManyAndReturn({
      where: {
        status: 'LIVE',
        id: { notIn: listed },
        disconnectedAt: graceWindow(now).past,
      },
      data: { status: 'ENDED', endedAt: now },
      select: { id: true },
    });
    if (reconnected.count + lostWithoutClosing.count + ended.length > 0) {
      this.logger.log(
        `Swept: ${reconnected.count} reconnected, ${lostWithoutClosing.count} lost without closing, ${ended.length} ended`,
      );
    }
    for (const { id } of ended) {
      await this.ome
        .stopRecord(id)
        .catch((error: unknown) =>
          this.logger.error(`Stopping the recording of ${id} failed`, error),
        );
    }
  }
}
