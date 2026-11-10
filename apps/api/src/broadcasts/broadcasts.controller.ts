import {
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import { BroadcastOwnerGuard } from './broadcast-owner.guard.js';
import {
  BroadcastsService,
  type BroadcastView,
  type CreateBroadcastInput,
  type PublicStatus,
  type UpdateBroadcastInput,
} from './broadcasts.service.js';
import { ThumbnailRateGuard } from './thumbnail-rate.guard.js';
import { isJpeg } from './thumbnail-store.js';

export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 2000;

const title = z.string().trim().min(1).max(TITLE_MAX_LENGTH);
const description = z.string().trim().max(DESCRIPTION_MAX_LENGTH);

const createSchema = z.object({ title, description: description.default('') });

// Unknown keys such as `status` are stripped: only the server moves status.
const updateSchema = z
  .object({ title: title.optional(), description: description.optional() })
  .refine((b) => b.title !== undefined || b.description !== undefined, {
    message: 'Nothing to update',
  });

const publicStatus = { LIVE: 'LIVE', ENDED: 'ENDED' } as const;

const THUMBNAIL_MAX_BYTES = 512 * 1024;
const THUMBNAIL_INVALID_MESSAGE =
  '512KB 이하의 JPEG 이미지만 올릴 수 있습니다.';

// The part of a multer file this controller reads. @types/multer is not a
// dependency.
interface UploadedImage {
  buffer: Buffer;
}

// Multer reports an oversized file as 413. To a client it is one more way the
// image is invalid, so it gets the same 400 as a wrong format.
@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  catch(_error: PayloadTooLargeException, host: ArgumentsHost): void {
    const body = new BadRequestException(
      THUMBNAIL_INVALID_MESSAGE,
    ).getResponse();
    host.switchToHttp().getResponse<Response>().status(400).json(body);
  }
}

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

  // Guards run before the interceptor, so only the owner's upload within the
  // rate is ever read into memory (multer's default storage).
  @Put('broadcasts/:id/thumbnail')
  @HttpCode(204)
  @UseGuards(LoggedInGuard, BroadcastOwnerGuard, ThumbnailRateGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: THUMBNAIL_MAX_BYTES, files: 1 },
    }),
  )
  @UseFilters(FileTooLargeFilter)
  uploadThumbnail(
    @Param('id') id: string,
    @UploadedFile() image: UploadedImage | undefined,
  ): Promise<void> {
    // The magic bytes decide, not the Content-Type the client claims.
    if (!image || !isJpeg(image.buffer)) {
      throw new BadRequestException(THUMBNAIL_INVALID_MESSAGE);
    }
    return this.broadcasts.saveThumbnail(id, image.buffer);
  }

  @Delete('broadcasts/:id')
  @HttpCode(204)
  @UseGuards(LoggedInGuard, BroadcastOwnerGuard)
  remove(@Param('id') id: string): Promise<void> {
    return this.broadcasts.remove(id);
  }
}
