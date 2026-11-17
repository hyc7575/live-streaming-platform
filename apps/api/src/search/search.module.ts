import { Module } from '@nestjs/common';
import { BroadcastsModule } from '../broadcasts/broadcasts.module.js';
import { StreamersModule } from '../streamers/streamers.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [BroadcastsModule, StreamersModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
