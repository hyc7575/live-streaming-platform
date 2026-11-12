import {
  BadGatewayException,
  BadRequestException,
  type Logger,
} from '@nestjs/common';
import {
  TossPaymentsError,
  type TossConfirmInput,
  type TossPayments,
} from './toss-payments.js';

export const TOSS_FAILED_MESSAGE =
  '결제 승인 결과를 확인하지 못했습니다. 잠시 후 다시 시도하세요.';

// Asks Toss to approve the payment and returns when it was approved. Toss's
// answer is checked against the order, so a payment that did not finish or
// that approved another amount is never credited. A Toss refusal (4xx)
// becomes a 400 carrying Toss's message for the buyer; anything else is a
// 502, since whether the payment went through is unknown.
export async function approveTossPayment(
  toss: TossPayments,
  input: TossConfirmInput,
  logger: Logger,
): Promise<Date> {
  let payment;
  try {
    payment = await toss.confirm(input);
  } catch (error) {
    if (
      error instanceof TossPaymentsError &&
      error.httpStatus >= 400 &&
      error.httpStatus < 500
    ) {
      throw new BadRequestException({
        message: error.message,
        code: error.code,
      });
    }
    logger.error(`Toss confirm of ${input.orderId} failed`, error);
    throw new BadGatewayException(TOSS_FAILED_MESSAGE);
  }
  if (
    payment.status !== 'DONE' ||
    payment.totalAmount !== input.amount ||
    payment.orderId !== input.orderId ||
    payment.paymentKey !== input.paymentKey
  ) {
    logger.error(
      `Toss confirm of ${input.orderId} answered an unexpected payment`,
      JSON.stringify(payment),
    );
    throw new BadGatewayException(TOSS_FAILED_MESSAGE);
  }
  return payment.approvedAt ? new Date(payment.approvedAt) : new Date();
}
