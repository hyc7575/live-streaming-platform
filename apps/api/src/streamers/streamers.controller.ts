import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { BroadcastView } from '../broadcasts/broadcasts.service.js';
import { StreamersService, type StreamerProfile } from './streamers.service.js';

// 스트리머의 공개 채널 페이지. 방송 목록처럼 누구나 읽을 수
// 있다. 형식이 틀린 id는 400, 모르는 id는 404이다(PRD-mypage 7.2).
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
