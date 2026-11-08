import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { BroadcastsModule } from './broadcasts/broadcasts.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [DatabaseModule, AuthModule, BroadcastsModule],
  controllers: [HealthController],
})
export class AppModule {}
