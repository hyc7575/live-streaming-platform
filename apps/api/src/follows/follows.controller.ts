import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import {
  FollowsService,
  type FollowedStreamer,
  type FollowerList,
} from './follows.service.js';

// guard가 pipe보다 먼저 돈다. 그래서 익명 호출자는 잘못된 id로 400을 받기 전에
// 401을 받는다.
@Controller()
@UseGuards(LoggedInGuard)
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Put('streamers/:id/follow')
  @HttpCode(204)
  follow(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) streamerId: string,
  ): Promise<void> {
    return this.follows.follow(user.id, streamerId);
  }

  @Delete('streamers/:id/follow')
  @HttpCode(204)
  unfollow(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) streamerId: string,
  ): Promise<void> {
    return this.follows.unfollow(user.id, streamerId);
  }

  @Get('me/follows')
  list(@CurrentUser() user: AuthUser): Promise<FollowedStreamer[]> {
    return this.follows.list(user.id);
  }

  @Get('me/followers')
  followers(@CurrentUser() user: AuthUser): Promise<FollowerList> {
    return this.follows.followers(user.id);
  }
}
