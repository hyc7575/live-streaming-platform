import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { BroadcastLifecycle } from '../broadcasts/broadcast-lifecycle.js';

export const SWEEP_INTERVAL_MS = Symbol('SWEEP_INTERVAL_MS');
export const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

// PRD §7.4 좀비 정리(T8)를 주기적으로 부른다. 무엇을 바꾸는지는
// BroadcastLifecycle.sweep()이 정한다. 한 번에 하나만 돈다.
@Injectable()
export class PublishSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly lifecycle: BroadcastLifecycle,
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
    this.running = this.sweep()
      .catch((error: unknown) => this.logger.error('Sweep failed', error))
      .finally(() => {
        this.running = null;
      });
  }

  // 테스트는 `now`를 넘겨, 스트림 목록보다 먼저 시작한 sweep을 흉내 낸다.
  sweep(now?: Date): Promise<void> {
    return this.lifecycle.sweep(now);
  }
}
