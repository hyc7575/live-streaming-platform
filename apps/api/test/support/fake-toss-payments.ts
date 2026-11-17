import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  TOSS_PAYMENTS,
  type TossConfig,
  type TossConfirmInput,
  type TossPayment,
  type TossPayments,
} from '../../src/donations/toss-payments.js';

export const TEST_TOSS_CONFIG: TossConfig = {
  clientKey: 'test_gck_fake',
  secretKey: 'test_gsk_fake',
};

// Toss 결제 API를 대신한다. CI는 이 API를 부르지 않는다. 기본으로는
// 모든 결제를 승인하고, Toss처럼 입력을 그대로 돌려준다.
export class FakeTossPayments implements TossPayments {
  calls: TossConfirmInput[] = [];
  // 응답 대신 던진다. Toss 오류나 네트워크 장애와 같다.
  failure: Error | null = null;
  // 승인된 결제를 바꾼다. 주문과 맞지 않는 응답을 만들 때 쓴다.
  tamper: (payment: TossPayment) => TossPayment = (payment) => payment;
  // 응답마다 잠시 붙잡아 두어, 동시 승인이 겹치게 한다.
  delayMs = 0;
  // 지금 응답을 기다리는 호출 수와 그 최댓값. 확정 동시 상한을 확인한다.
  inFlight = 0;
  maxInFlight = 0;

  async confirm(input: TossConfirmInput): Promise<TossPayment> {
    this.calls.push(input);
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }
    } finally {
      this.inFlight -= 1;
    }
    if (this.failure) throw this.failure;
    return this.tamper({
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      status: 'DONE',
      totalAmount: input.amount,
      approvedAt: new Date().toISOString(),
    });
  }

  reset(): void {
    this.calls = [];
    this.failure = null;
    this.tamper = (payment) => payment;
    this.delayMs = 0;
    this.inFlight = 0;
    this.maxInFlight = 0;
  }
}

export function fakeTossPaymentsOf(
  app: NestExpressApplication,
): FakeTossPayments {
  return app.get<FakeTossPayments>(TOSS_PAYMENTS);
}
