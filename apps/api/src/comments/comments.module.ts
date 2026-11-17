import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import { BroadcastsModule } from '../broadcasts/broadcasts.module.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  // 라우트의 @Throttle이 한도를 정한다. 이 기본값은 쓰이지 않는다.
  imports: [
    AuthModule,
    BroadcastsModule,
    ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }]),
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
