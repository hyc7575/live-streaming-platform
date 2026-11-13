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

// Toss에 결제 승인을 요청하고 승인 시각을 돌려준다. Toss의
// 응답을 주문과 대조하므로, 끝나지 않은 결제나
// 다른 금액으로 승인된 결제는 적립되지 않는다. Toss의 거절(4xx)은
// 구매자에게 보여 줄 Toss 메시지를 담은 400이 된다. 그 밖의 경우는
// 결제가 됐는지 알 수 없으므로 502이다.
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
