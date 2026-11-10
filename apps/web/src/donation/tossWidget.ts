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

// The widget refuses a second render into a container it already filled, so
// mounts and teardowns run one at a time. StrictMode's mount, unmount, mount
// then lands as a skipped first mount followed by the real one.
let turn: Promise<unknown> = Promise.resolve();
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = turn.then(task);
  turn = run.catch(() => undefined);
  return run;
}

// Renders the payment methods and agreement into the two containers for the
// order's amount. Aborting `signal` tears the widget down. Resolves to null
// when it was aborted first.
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
