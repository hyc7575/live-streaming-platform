import { useEffect, useState, type ReactNode } from 'react';
import form from '../pages/AuthForm.module.css';
import styles from '../pages/DonatePage.module.css';
import {
  AGREEMENT_ID,
  PAYMENT_METHODS_ID,
  mountDonationWidget,
  type RequestPayment,
} from './tossWidget';

// What the Toss widget needs from an order, card donation or lime charge.
export interface PaymentOrder {
  orderId: string;
  orderName: string;
  amount: number;
  clientKey: string;
  customerKey: string;
}

type WidgetState =
  | { status: 'loading' }
  | { status: 'ready'; requestPayment: RequestPayment }
  | { status: 'failed' };

// Step 2 of a payment: renders the Toss widget for the saved order and
// sends the buyer to Toss, which redirects to successPath or failPath.
export function PaymentStep({
  order,
  summary,
  successPath,
  failPath,
  onChangeAmount,
}: {
  order: PaymentOrder;
  summary: ReactNode;
  successPath: string;
  failPath: string;
  onChangeAmount: () => void;
}) {
  const [widget, setWidget] = useState<WidgetState>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    mountDonationWidget(order, abort.signal).then(
      (requestPayment) => {
        if (requestPayment) setWidget({ status: 'ready', requestPayment });
      },
      () => {
        if (!abort.signal.aborted) setWidget({ status: 'failed' });
      },
    );
    return () => abort.abort();
  }, [order]);

  async function pay() {
    if (widget.status !== 'ready') return;
    setPaying(true);
    setError(null);
    try {
      await widget.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}${successPath}`,
        failUrl: `${window.location.origin}${failPath}`,
      });
    } catch (err) {
      // Toss errors carry a Korean message meant for the buyer.
      const tossMessage =
        err instanceof Error && err.message ? err.message : null;
      setError(tossMessage ?? '결제를 요청하지 못했습니다.');
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className={form.form}>
      <p className={styles.summary}>{summary}</p>
      {widget.status === 'loading' && (
        <p className={form.notice}>결제 화면을 불러오는 중입니다.</p>
      )}
      {widget.status === 'failed' && (
        <p className={form.error} role="alert">
          결제 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}
      <div id={PAYMENT_METHODS_ID} />
      <div id={AGREEMENT_ID} />
      {error && (
        <p className={form.error} role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={form.submit}
        disabled={widget.status !== 'ready' || paying}
        onClick={() => void pay()}
      >
        결제하기
      </button>
      <button
        type="button"
        className={styles.secondary}
        disabled={paying}
        onClick={onChangeAmount}
      >
        금액 바꾸기
      </button>
    </div>
  );
}
