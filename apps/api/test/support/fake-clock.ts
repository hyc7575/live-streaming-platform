import type { NestExpressApplication } from '@nestjs/platform-express';
import { CLOCK, type Clock } from '../../src/clock.js';

export class FakeClock implements Clock {
  private current = new Date();

  now(): Date {
    return new Date(this.current);
  }

  set(at: Date): void {
    this.current = new Date(at);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export function fakeClockOf(app: NestExpressApplication): FakeClock {
  return app.get<FakeClock>(CLOCK);
}
