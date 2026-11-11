import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { BroadcastsModule } from './broadcasts/broadcasts.module.js';
import { ChannelModule } from './channel/channel.module.js';
import { ChatModule } from './chat/chat.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DonationsModule } from './donations/donations.module.js';
import { FollowsModule } from './follows/follows.module.js';
import { HealthController } from './health.controller.js';
import { PublishModule } from './publish/publish.module.js';
import { RecordingsModule } from './recording/recordings.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BroadcastsModule,
    ChannelModule,
    ChatModule,
    CommentsModule,
    DonationsModule,
    FollowsModule,
    PublishModule,
    RecordingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
