import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import {
  BroadcastsService,
  type BroadcastView,
  type CreateBroadcastInput,
  type PublicStatus,
} from './broadcasts.service.js';

export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 2000;

const createSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
  description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).default(''),
});

const publicStatus = { LIVE: 'LIVE', ENDED: 'ENDED' } as const;

@Controller()
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Post('broadcasts')
  @UseGuards(LoggedInGuard)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(createSchema)) body: CreateBroadcastInput,
  ): Promise<BroadcastView> {
    return this.broadcasts.create(user.id, body);
  }

  @Get('broadcasts')
  listPublic(
    @Query('status', new ParseEnumPipe(publicStatus, { optional: true }))
    status?: PublicStatus,
  ): Promise<BroadcastView[]> {
    return this.broadcasts.listPublic(status);
  }

  @Get('broadcasts/:id')
  get(@Param('id') id: string): Promise<BroadcastView> {
    return this.broadcasts.get(id);
  }

  @Get('me/broadcasts')
  @UseGuards(LoggedInGuard)
  listMine(@CurrentUser() user: AuthUser): Promise<BroadcastView[]> {
    return this.broadcasts.listByStreamer(user.id);
  }
}
