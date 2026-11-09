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

// PRD §7.4 zombie cleanup (T8). OME's `closing` can go missing or arrive
// after the reconnect it belongs before, so the API periodically reconciles
// the LIVE broadcasts with the streams OME is actually receiving.
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
      // Postgres rejects a non-uuid in an `in` filter on a uuid column.
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
        // A drop at or after `now` may be newer than the list, which was
        // fetched after `now` was read. The next sweep settles it.
        disconnectedAt: { lt: now },
      },
      data: { disconnectedAt: null },
    });
    const lostWithoutClosing = await this.prisma.broadcast.updateMany({
      where: { status: 'LIVE', id: { notIn: listed }, disconnectedAt: null },
      data: { disconnectedAt: now },
    });
    // No OME DELETE as in end(): these streams are absent from the list just
    // fetched, and the webhook refuses a later reconnect once ENDED is saved.
    const ended = await this.prisma.broadcast.updateMany({
      where: {
        status: 'LIVE',
        id: { notIn: listed },
        disconnectedAt: graceWindow(now).past,
      },
      data: { status: 'ENDED', endedAt: now },
    });
    if (reconnected.count + lostWithoutClosing.count + ended.count > 0) {
      this.logger.log(
        `Swept: ${reconnected.count} reconnected, ${lostWithoutClosing.count} lost without closing, ${ended.count} ended`,
      );
    }
  }
}
