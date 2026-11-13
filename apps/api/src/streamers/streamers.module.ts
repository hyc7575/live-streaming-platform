import { Module } from '@nestjs/common';
import { BroadcastsModule } from '../broadcasts/broadcasts.module.js';
import { StreamersController } from './streamers.controller.js';
import { StreamersService } from './streamers.service.js';

@Module({
  imports: [BroadcastsModule],
  controllers: [StreamersController],
  providers: [StreamersService],
})
export class StreamersModule {}
