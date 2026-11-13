import { Module } from '@nestjs/common';
import {
  HttpTossPayments,
  TOSS_CONFIG,
  TOSS_PAYMENTS,
  tossConfigFromEnv,
  type TossConfig,
} from './toss-payments.js';

// 모든 결제가 Toss 클라이언트 하나를 쓴다. 카드 후원과 라임 충전.
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
