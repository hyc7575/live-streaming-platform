import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { BroadcastsModule } from '../broadcasts/broadcasts.module.js';
import { CLOCK, systemClock } from '../clock.js';
import { StreamersModule } from '../streamers/streamers.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  // 라우트의 @Throttle이 한도를 정한다. 이 기본값은 쓰이지 않는다.
  imports: [
    BroadcastsModule,
    StreamersModule,
    ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }]),
  ],
  controllers: [SearchController],
  providers: [SearchService, { provide: CLOCK, useValue: systemClock }],
})
export class SearchModule {}
