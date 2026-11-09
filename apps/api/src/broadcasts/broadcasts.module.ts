import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OmeModule } from '../ome/ome.module.js';
import { BroadcastsController } from './broadcasts.controller.js';
import { BroadcastsService } from './broadcasts.service.js';

@Module({
  imports: [AuthModule, OmeModule],
  controllers: [BroadcastsController],
  providers: [BroadcastsService],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}
