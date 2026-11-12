import { Module } from '@nestjs/common';
import {
  HttpTossPayments,
  TOSS_CONFIG,
  TOSS_PAYMENTS,
  tossConfigFromEnv,
  type TossConfig,
} from './toss-payments.js';

// One Toss client for every payment: card donations and lime charges.
@Module({
  providers: [
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
  exports: [TOSS_CONFIG, TOSS_PAYMENTS],
})
export class TossPaymentsModule {}
