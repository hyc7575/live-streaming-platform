import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BroadcastsModule } from '../broadcasts/broadcasts.module.js';
import { DonationsController } from './donations.controller.js';
import { DonationsService } from './donations.service.js';
import {
  HttpTossPayments,
  TOSS_CONFIG,
  TOSS_PAYMENTS,
  tossConfigFromEnv,
  type TossConfig,
} from './toss-payments.js';

@Module({
  imports: [AuthModule, BroadcastsModule],
  controllers: [DonationsController],
  providers: [
    DonationsService,
    {
      provide: TOSS_CONFIG,
      useFactory: () => tossConfigFromEnv(process.env),
    },
    {
      provide: TOSS_PAYMENTS,
      inject: [TOSS_CONFIG],
      useFactory: (config: TossConfig | null) =>
        config && new HttpTossPayments(config),
    },
  ],
})
export class DonationsModule {}
