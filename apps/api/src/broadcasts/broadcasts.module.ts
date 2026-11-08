import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BroadcastsController } from './broadcasts.controller.js';
import { BroadcastsService } from './broadcasts.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BroadcastsController],
  providers: [BroadcastsService],
})
export class BroadcastsModule {}
