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
import { graceCutoff } from './admission.js';

// Milliseconds between sweeps, or null for none (tests call sweep()).
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
  // The sweep still running, if any. A tick that finds one skips, and
  // shutdown waits for it so it does not outlive the database pool.
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

  // Each step is one conditional write, so it is safe to repeat and resolves
  // a race with the webhook to one outcome. `now` is read before OME lists
  // its streams, so the list is at least as new as `now`.
  async sweep(now: Date): Promise<void> {
    let listed: string[];
    try {
      // Postgres rejects a non-uuid in an `in` filter on a uuid column.
      listed = (await this.ome.listStreams()).filter(
        (name) => uuid.safeParse(name).success,
      );
    } catch (error) {
      // Without the list, every LIVE broadcast would look dropped.
      this.logger.warn('Skipping the sweep: OME did not list streams', error);
      return;
    }
    // A closing that arrived after the reconnect's opening. A drop at or
    // after `now` may be newer than the list, so it is left for next time.
    const reconnected = await this.prisma.broadcast.updateMany({
      where: {
        status: 'LIVE',
        id: { in: listed },
        disconnectedAt: { lt: now },
      },
      data: { disconnectedAt: null },
    });
    // No stream and no closing: the webhook went missing. Start the grace.
    const lost = await this.prisma.broadcast.updateMany({
      where: { status: 'LIVE', id: { notIn: listed }, disconnectedAt: null },
      data: { disconnectedAt: now },
    });
    // No DELETE to OME: these broadcasts were absent from the list just
    // fetched, so OME has no stream to drop, and a later reconnect is refused
    // by the webhook because the database says ENDED first.
    const ended = await this.prisma.broadcast.updateMany({
      where: {
        status: 'LIVE',
        id: { notIn: listed },
        disconnectedAt: { lte: graceCutoff(now) },
      },
      data: { status: 'ENDED', endedAt: now },
    });
    if (reconnected.count + lost.count + ended.count > 0) {
      this.logger.log(
        `Swept: ${reconnected.count} reconnected, ${lost.count} lost without closing, ${ended.count} ended`,
      );
    }
  }
}
