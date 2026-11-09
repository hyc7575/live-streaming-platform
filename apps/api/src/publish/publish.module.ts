import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BroadcastsModule } from '../broadcasts/broadcasts.module.js';
import { CLOCK, systemClock } from '../clock.js';
import { OmeSignatureGuard } from './ome-signature.guard.js';
import { PUBLISH_CONFIG, publishConfigFromEnv } from './publish-config.js';
import { PublishController } from './publish.controller.js';
import { PublishService } from './publish.service.js';

@Module({
  imports: [AuthModule, BroadcastsModule],
  controllers: [PublishController],
  providers: [
    PublishService,
    OmeSignatureGuard,
    { provide: CLOCK, useValue: systemClock },
    {
      provide: PUBLISH_CONFIG,
      useFactory: () => publishConfigFromEnv(process.env),
    },
  ],
})
export class PublishModule {}
