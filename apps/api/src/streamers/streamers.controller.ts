import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { BroadcastView } from '../broadcasts/broadcasts.service.js';
import { StreamersService, type StreamerProfile } from './streamers.service.js';

// A streamer's public channel page. Anyone may read it, like the broadcast
// list. A malformed id is 400 and an unknown one 404 (PRD-mypage 7.2).
@Controller('streamers/:id')
export class StreamersController {
  constructor(private readonly streamers: StreamersService) {}

  @Get()
  profile(@Param('id', ParseUUIDPipe) id: string): Promise<StreamerProfile> {
    return this.streamers.profile(id);
  }

  @Get('broadcasts')
  broadcasts(@Param('id', ParseUUIDPipe) id: string): Promise<BroadcastView[]> {
    return this.streamers.broadcastsOf(id);
  }
}
