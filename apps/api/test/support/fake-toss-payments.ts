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

// Stands in for Toss's payment API, which CI never calls. By default it
// approves every payment, echoing the input the way Toss does.
export class FakeTossPayments implements TossPayments {
  calls: TossConfirmInput[] = [];
  // Thrown instead of answering, like a Toss error or a network failure.
  failure: Error | null = null;
  // Changes the approved payment, for answers that do not match the order.
  tamper: (payment: TossPayment) => TossPayment = (payment) => payment;
  // Holds each answer back, so concurrent confirms overlap.
  delayMs = 0;

  async confirm(input: TossConfirmInput): Promise<TossPayment> {
    this.calls.push(input);
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
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
  }
}

export function fakeTossPaymentsOf(
  app: NestExpressApplication,
): FakeTossPayments {
  return app.get<FakeTossPayments>(TOSS_PAYMENTS);
}
