import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import { ChatAuthorGuard } from './chat-author.guard.js';
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

@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('broadcasts/:id/chat')
  list(
    @Param('id') broadcastId: string,
    @Query('after') after: unknown,
  ): Promise<ChatMessageView[]> {
    const cursor = cursorSchema.safeParse(after);
    if (!cursor.success) throw new BadRequestException('Invalid after cursor');
    return this.chat.list(broadcastId, cursor.data);
  }

  @Post('broadcasts/:id/chat')
  @UseGuards(LoggedInGuard)
  create(
    @Param('id') broadcastId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(bodySchema)) input: ChatInput,
  ): Promise<ChatMessageView> {
    return this.chat.create(broadcastId, user.id, input.body);
  }

  @Delete('chat/:messageId')
  @HttpCode(204)
  @UseGuards(LoggedInGuard, ChatAuthorGuard)
  remove(@Param('messageId') id: string): Promise<void> {
    return this.chat.remove(id);
  }
}
