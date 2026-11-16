import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BroadcastsModule } from '../broadcasts/broadcasts.module.js';
import { OmeSignatureGuard } from './ome-signature.guard.js';
import { PUBLISH_CONFIG, publishConfigFromEnv } from './publish-config.js';
import {
  DEFAULT_SWEEP_INTERVAL_MS,
  PublishSweeper,
  SWEEP_INTERVAL_MS,
} from './publish-sweeper.js';
import { PublishController } from './publish.controller.js';
import { PublishService } from './publish.service.js';

@Module({
  imports: [AuthModule, BroadcastsModule],
  controllers: [PublishController],
  providers: [
    PublishService,
    PublishSweeper,
    OmeSignatureGuard,
    { provide: SWEEP_INTERVAL_MS, useValue: DEFAULT_SWEEP_INTERVAL_MS },
    {
      provide: PUBLISH_CONFIG,
      useFactory: () => publishConfigFromEnv(process.env),
    },
  ],
})
export class PublishModule {}
