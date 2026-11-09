import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { BroadcastsModule } from './broadcasts/broadcasts.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { PublishModule } from './publish/publish.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, BroadcastsModule, PublishModule],
  controllers: [HealthController],
})
export class AppModule {}
