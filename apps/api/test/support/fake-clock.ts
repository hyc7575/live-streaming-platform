import type { NestExpressApplication } from '@nestjs/platform-express';
import { CLOCK, type Clock } from '../../src/clock.js';

export class FakeClock implements Clock {
  private current = new Date();
  private stepPerRead = 0;

  now(): Date {
    const at = new Date(this.current);
    this.current = new Date(this.current.getTime() + this.stepPerRead);
    return at;
  }

  // 읽을 때마다 시계를 `ms`만큼 앞으로 민다. 한 요청 안에서 시각을 두 번
  // 읽는 코드를 잡는다. set()이 0으로 되돌린다.
  advanceOnEachRead(ms: number): void {
    this.stepPerRead = ms;
  }

  set(at: Date): void {
    this.current = new Date(at);
    this.stepPerRead = 0;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export function fakeClockOf(app: NestExpressApplication): FakeClock {
  return app.get<FakeClock>(CLOCK);
}
