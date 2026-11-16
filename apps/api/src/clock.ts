import { Global, Module } from '@nestjs/common';

export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };

// 시계는 앱 전체에 하나다. 테스트가 CLOCK 하나만 바꾸면 모든 module이
// 같은 가짜 시계를 본다.
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
