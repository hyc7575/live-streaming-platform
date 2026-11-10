import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CLOCK, systemClock } from '../clock.js';
import { OmeModule } from '../ome/ome.module.js';
import { BroadcastsController } from './broadcasts.controller.js';
import { BroadcastsService } from './broadcasts.service.js';
import { ThumbnailRateGuard } from './thumbnail-rate.guard.js';
import {
  THUMBNAILS_DIR,
  ThumbnailStore,
  thumbnailsDirFromEnv,
} from './thumbnail-store.js';

@Module({
  imports: [AuthModule, OmeModule],
  controllers: [BroadcastsController],
  providers: [
    BroadcastsService,
    ThumbnailStore,
    ThumbnailRateGuard,
    { provide: CLOCK, useValue: systemClock },
    {
      provide: THUMBNAILS_DIR,
      useFactory: () => thumbnailsDirFromEnv(process.env),
    },
  ],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}
