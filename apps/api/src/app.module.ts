import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { BroadcastsModule } from './broadcasts/broadcasts.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { PublishModule } from './publish/publish.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BroadcastsModule,
    CommentsModule,
    PublishModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
