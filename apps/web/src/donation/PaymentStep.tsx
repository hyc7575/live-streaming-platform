import { useEffect, useState, type ReactNode } from 'react';
import form from '../pages/AuthForm.module.css';
import styles from '../pages/DonatePage.module.css';
import {
  AGREEMENT_ID,
  PAYMENT_METHODS_ID,
  mountDonationWidget,
  type RequestPayment,
} from './tossWidget';

// Toss 위젯이 주문에서 필요로 하는 값이다. 카드 후원이든 라임 충전이든 같다.
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

// 결제 2단계다. 저장한 주문으로 Toss 위젯을 그리고, 구매자를
// Toss로 보낸다. Toss는 successPath나 failPath로 리다이렉트한다.
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
      // Toss 오류에는 구매자에게 보여 줄 한국어 메시지가 들어 있다.
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
