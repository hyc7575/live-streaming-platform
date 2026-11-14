import { loadTossPayments } from '@tosspayments/tosspayments-sdk';
import type { DonationOrder } from '../donations';

export const PAYMENT_METHODS_ID = 'donation-payment-methods';
export const AGREEMENT_ID = 'donation-agreement';

export interface PaymentRequest {
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
}

export type RequestPayment = (request: PaymentRequest) => Promise<void>;

// 위젯은 이미 채운 컨테이너에 다시 그리기를 거부한다. 그래서
// 마운트와 정리를 한 번에 하나씩 실행한다. 그러면 StrictMode의 마운트, 언마운트, 마운트는
// 건너뛴 첫 마운트와 그 뒤의 실제 마운트가 된다.
let turn: Promise<unknown> = Promise.resolve();
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = turn.then(task);
  turn = run.catch(() => undefined);
  return run;
}

// 주문 금액으로 결제 수단과 약관 동의를 두 컨테이너에 그린다.
// `signal`을 abort하면 위젯을 정리한다. 먼저 abort됐으면
// null로 resolve한다.
export function mountDonationWidget(
  order: Pick<DonationOrder, 'clientKey' | 'customerKey' | 'amount'>,
  signal: AbortSignal,
): Promise<RequestPayment | null> {
  return inTurn(async () => {
    if (signal.aborted) return null;
    const toss = await loadTossPayments(order.clientKey);
    const widgets = toss.widgets({ customerKey: order.customerKey });
    await widgets.setAmount({ currency: 'KRW', value: order.amount });
    const rendered = await Promise.all([
      widgets.renderPaymentMethods({ selector: `#${PAYMENT_METHODS_ID}` }),
      widgets.renderAgreement({ selector: `#${AGREEMENT_ID}` }),
    ]);
    const teardown = () =>
      Promise.all(rendered.map((w) => w.destroy())).catch(() => undefined);
    if (signal.aborted) {
      await teardown();
      return null;
    }
    signal.addEventListener('abort', () => void inTurn(teardown), {
      once: true,
    });
    return async (request) => {
      await widgets.requestPayment(request);
    };
  });
}
