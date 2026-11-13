import { Controller, Delete, HttpCode, Put, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import {
  ImageUpload,
  UploadedImage,
  type ParsedImage,
} from '../images/image-rules.js';
import { UserImageService } from './user-image.service.js';

// The caller's own channel. No path names a user, so there is no 403 case.
@Controller('me/standby-image')
@UseGuards(LoggedInGuard)
export class StandbyImageController {
  constructor(private readonly images: UserImageService) {}

  @Put()
  @ImageUpload('standby')
  save(
    @CurrentUser() user: AuthUser,
    @UploadedImage('standby') image: ParsedImage,
  ): Promise<AuthUser> {
    return this.images.save(user.id, 'standby', image);
  }

  @Delete()
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser): Promise<void> {
    return this.images.remove(user.id, 'standby');
  }
}
