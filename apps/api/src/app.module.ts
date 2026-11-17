import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { BroadcastsModule } from './broadcasts/broadcasts.module.js';
import { ChannelModule } from './channel/channel.module.js';
import { ChatModule } from './chat/chat.module.js';
import { ClockModule } from './clock.js';
import { CommentsModule } from './comments/comments.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DonationsModule } from './donations/donations.module.js';
import { FollowsModule } from './follows/follows.module.js';
import { GamesModule } from './games/games.module.js';
import { StreamersModule } from './streamers/streamers.module.js';
import { HealthController } from './health.controller.js';
import { LimeModule } from './lime/lime.module.js';
import { PublishModule } from './publish/publish.module.js';
import { RecordingsModule } from './recording/recordings.module.js';
import { SearchModule } from './search/search.module.js';

@Module({
  imports: [
    // 요청 제한 설정은 여기 한 곳에만 둔다. 라우트마다 @Throttle로 자기 한도를
    // 정하므로 이 기본값은 쓰이지 않는다.
    ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }]),
    DatabaseModule,
    ClockModule,
    AuthModule,
    BroadcastsModule,
    ChannelModule,
    ChatModule,
    CommentsModule,
    DonationsModule,
    FollowsModule,
    GamesModule,
    StreamersModule,
    LimeModule,
    PublishModule,
    RecordingsModule,
    SearchModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
