import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import { BroadcastCategory } from '../generated/prisma/client.js';
import { GAME_QID_PATTERN } from '../games/game-qid.js';
import {
  ImageUpload,
  UploadedImage,
  type ParsedImage,
} from '../images/image-rules.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import { BroadcastOwnerGuard } from './broadcast-owner.guard.js';
import {
  BroadcastsService,
  type BroadcastView,
  type CreateBroadcastInput,
  type PublicStatus,
  type UpdateBroadcastInput,
} from './broadcasts.service.js';
import type { GameChoice, GameColumns } from './game-update.js';
import { ThumbnailRateGuard } from './thumbnail-rate.guard.js';

export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const GAME_NAME_MAX_LENGTH = 50;

const title = z.string().trim().min(1).max(TITLE_MAX_LENGTH);
const description = z.string().trim().max(DESCRIPTION_MAX_LENGTH);
const category = z.enum(BroadcastCategory);

const gameFields = {
  gameQid: z.string().regex(GAME_QID_PATTERN).nullable().optional(),
  gameName: z
    .string()
    .trim()
    .min(1)
    .max(GAME_NAME_MAX_LENGTH)
    .nullable()
    .optional(),
};

// 게임 필드를 하나라도 보내면 게임 전체를 바꾼다. qid가 있으면 목록 게임이고
// 보낸 이름은 버린다. 이름만 있으면 직접 입력이다.
function withGameChoice<T extends Partial<GameColumns>>({
  gameQid,
  gameName,
  ...rest
}: T): Omit<T, 'gameQid' | 'gameName'> & { game?: GameChoice | null } {
  if (gameQid === undefined && gameName === undefined) return rest;
  const game = gameQid
    ? { qid: gameQid }
    : gameName
      ? { name: gameName }
      : null;
  return { ...rest, game };
}

// 게임과 카테고리가 맞는지는 서비스가 resolveGameUpdate로 판단한다.
const createSchema = z
  .object({
    title,
    description: description.default(''),
    category: category.default('ETC'),
    ...gameFields,
  })
  .transform(withGameChoice);

// `status` 같은 모르는 키는 제거한다. status는 서버만 바꾼다.
const updateSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    category: category.optional(),
    ...gameFields,
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Nothing to update',
  })
  .transform(withGameChoice);

const publicStatus = {
  LIVE: 'LIVE',
  READY: 'READY',
  ENDED: 'ENDED',
} as const satisfies Record<PublicStatus, PublicStatus>;

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
    return this.broadcasts.listPublic({ status });
  }

  @Get('replays')
  listReplays(): Promise<BroadcastView[]> {
    return this.broadcasts.listReplays();
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

  @Patch('broadcasts/:id')
  @UseGuards(LoggedInGuard, BroadcastOwnerGuard)
  update(
    @Param('id') id: string,
    @Body(new ZodBodyPipe(updateSchema)) body: UpdateBroadcastInput,
  ): Promise<BroadcastView> {
    return this.broadcasts.update(id, body);
  }

  @Post('broadcasts/:id/end')
  @HttpCode(200)
  @UseGuards(LoggedInGuard, BroadcastOwnerGuard)
  end(@Param('id') id: string): Promise<BroadcastView> {
    return this.broadcasts.end(id);
  }

  // guard가 interceptor보다 먼저 돈다. 그래서 소유자가 빈도 제한 안에서 올린
  // 업로드만 메모리로 읽는다(multer 기본 저장소).
  @Put('broadcasts/:id/thumbnail')
  @HttpCode(204)
  @UseGuards(LoggedInGuard, BroadcastOwnerGuard, ThumbnailRateGuard)
  @ImageUpload('thumbnail')
  uploadThumbnail(
    @Param('id') id: string,
    @UploadedImage('thumbnail') image: ParsedImage,
  ): Promise<void> {
    return this.broadcasts.saveThumbnail(id, image.bytes);
  }

  @Delete('broadcasts/:id')
  @HttpCode(204)
  @UseGuards(LoggedInGuard, BroadcastOwnerGuard)
  remove(@Param('id') id: string): Promise<void> {
    return this.broadcasts.remove(id);
  }
}
