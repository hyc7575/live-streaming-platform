import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import { UserThrottlerGuard } from '../auth/user-throttler.guard.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import { CommentAuthorGuard } from './comment-author.guard.js';
import {
  COMMENT_MAX_LENGTH,
  CommentsService,
  type CommentView,
} from './comments.service.js';

// `authorId` 같은 모르는 키는 제거한다.
const bodySchema = z.object({
  body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
});

type CommentInput = z.infer<typeof bodySchema>;

// 한 계정이 댓글로 목록을 덮지 못하게 사용자마다 묶는다(#213). 댓글은
// 방송 뒤 감상이라 채팅보다 느리게 쓴다.
export const COMMENT_RATE_LIMIT = { limit: 5, ttl: 60_000 };

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('broadcasts/:id/comments')
  list(@Param('id') broadcastId: string): Promise<CommentView[]> {
    return this.comments.list(broadcastId);
  }

  @Post('broadcasts/:id/comments')
  @UseGuards(LoggedInGuard, UserThrottlerGuard)
  @Throttle({ default: COMMENT_RATE_LIMIT })
  create(
    @Param('id') broadcastId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(bodySchema)) input: CommentInput,
  ): Promise<CommentView> {
    return this.comments.create(broadcastId, user.id, input.body);
  }

  @Patch('comments/:commentId')
  @UseGuards(LoggedInGuard, CommentAuthorGuard)
  update(
    @Param('commentId') id: string,
    @Body(new ZodBodyPipe(bodySchema)) input: CommentInput,
  ): Promise<CommentView> {
    return this.comments.update(id, input.body);
  }

  @Delete('comments/:commentId')
  @HttpCode(204)
  @UseGuards(LoggedInGuard, CommentAuthorGuard)
  remove(@Param('commentId') id: string): Promise<void> {
    return this.comments.remove(id);
  }
}
