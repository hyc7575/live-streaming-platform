import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, systemClock } from '../clock.js';
import { ImagesModule } from '../images/images.module.js';
import { StandbyImageController } from './standby-image.controller.js';
import { StandbyImageService } from './standby-image.service.js';

@Module({
  imports: [AuthModule, ImagesModule],
  controllers: [StandbyImageController],
  providers: [StandbyImageService, { provide: CLOCK, useValue: systemClock }],
})
export class ChannelModule {}
