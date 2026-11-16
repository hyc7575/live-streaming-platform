import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ImagesModule } from '../images/images.module.js';
import { OmeModule } from '../ome/ome.module.js';
import { BroadcastLifecycle } from './broadcast-lifecycle.js';
import { BroadcastsController } from './broadcasts.controller.js';
import { BroadcastsService } from './broadcasts.service.js';
import { ThumbnailRateGuard } from './thumbnail-rate.guard.js';

@Module({
  imports: [AuthModule, ImagesModule, OmeModule],
  controllers: [BroadcastsController],
  providers: [BroadcastsService, BroadcastLifecycle, ThumbnailRateGuard],
  exports: [BroadcastsService, BroadcastLifecycle],
})
export class BroadcastsModule {}
