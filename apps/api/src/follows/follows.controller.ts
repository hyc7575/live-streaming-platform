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
import { FollowsService, type FollowedStreamer } from './follows.service.js';

// Guards run before pipes, so an anonymous caller gets 401 before a bad id
// gets 400.
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
}
