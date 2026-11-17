import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import { UserThrottlerGuard } from '../auth/user-throttler.guard.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import {
  CHAT_MAX_LENGTH,
  ChatService,
  type ChatMessageView,
} from './chat.service.js';

const bodySchema = z.object({
  body: z.string().trim().min(1).max(CHAT_MAX_LENGTH),
});

type ChatInput = z.infer<typeof bodySchema>;

const cursorSchema = z.uuid().optional();

// `latest=true`면 처음부터가 아니라 최근 한 페이지를 읽는다(#213).
const latestSchema = z.literal('true').optional();

// 한 계정이 방송 채팅을 메시지로 덮지 못하게 사용자마다 묶는다(#213).
// 평균 1초에 1개이고, 몇 개를 몰아 보내는 것은 허용한다.
export const CHAT_RATE_LIMIT = { limit: 10, ttl: 10_000 };

@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('broadcasts/:id/chat')
  list(
    @Param('id') broadcastId: string,
    @Query('after') after: unknown,
    @Query('latest') latest: unknown,
  ): Promise<ChatMessageView[]> {
    const cursor = cursorSchema.safeParse(after);
    if (!cursor.success) throw new BadRequestException('Invalid after cursor');
    const recent = latestSchema.safeParse(latest);
    if (!recent.success) throw new BadRequestException('Invalid latest');
    if (recent.data) {
      if (cursor.data) {
        throw new BadRequestException('latest cannot be used with after');
      }
      return this.chat.latest(broadcastId);
    }
    return this.chat.list(broadcastId, cursor.data);
  }

  @Post('broadcasts/:id/chat')
  @UseGuards(LoggedInGuard, UserThrottlerGuard)
  @Throttle({ default: CHAT_RATE_LIMIT })
  create(
    @Param('id') broadcastId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(bodySchema)) input: ChatInput,
  ): Promise<ChatMessageView> {
    return this.chat.create(broadcastId, user.id, input.body);
  }
}
