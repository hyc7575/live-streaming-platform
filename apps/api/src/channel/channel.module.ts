import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, systemClock } from '../clock.js';
import { ImagesModule } from '../images/images.module.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';
import { StandbyImageController } from './standby-image.controller.js';
import { UserImageService } from './user-image.service.js';

@Module({
  imports: [AuthModule, ImagesModule],
  controllers: [StandbyImageController, ProfileController],
  providers: [
    UserImageService,
    ProfileService,
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class ChannelModule {}
