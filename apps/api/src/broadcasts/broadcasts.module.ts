import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, systemClock } from '../clock.js';
import { ImagesModule } from '../images/images.module.js';
import { OmeModule } from '../ome/ome.module.js';
import { BroadcastsController } from './broadcasts.controller.js';
import { BroadcastsService } from './broadcasts.service.js';
import { ThumbnailRateGuard } from './thumbnail-rate.guard.js';

@Module({
  imports: [AuthModule, ImagesModule, OmeModule],
  controllers: [BroadcastsController],
  providers: [
    BroadcastsService,
    ThumbnailRateGuard,
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}
