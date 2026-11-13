import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { bioSchema, nicknameSchema } from '../auth/fields.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import {
  ImageUpload,
  UploadedImage,
  type ParsedImage,
} from '../images/image-rules.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import { ProfileService, type ProfileInput } from './profile.service.js';
import { UserImageService } from './user-image.service.js';

const profileSchema = z
  .object({ nickname: nicknameSchema.optional(), bio: bioSchema.optional() })
  .refine((p) => p.nickname !== undefined || p.bio !== undefined, {
    message: 'nickname or bio is required',
  });

// The caller's own profile. No path names a user, so the only 403 is a test
// account's nickname. Guards run before the body pipe, so the order is
// 401 → 400 → 403 (PRD-mypage 7.2).
@Controller('me')
@UseGuards(LoggedInGuard)
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly images: UserImageService,
  ) {}

  @Patch('profile')
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(profileSchema)) input: ProfileInput,
  ): Promise<AuthUser> {
    return this.profile.update(user, input);
  }

  @Put('avatar')
  @ImageUpload('avatar')
  saveAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedImage('avatar') image: ParsedImage,
  ): Promise<AuthUser> {
    return this.images.save(user.id, 'avatar', image);
  }

  @Delete('avatar')
  @HttpCode(204)
  removeAvatar(@CurrentUser() user: AuthUser): Promise<void> {
    return this.images.remove(user.id, 'avatar');
  }
}
