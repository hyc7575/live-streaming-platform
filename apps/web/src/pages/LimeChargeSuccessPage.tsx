import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { announceCharge, closeTabOr } from '../donation/donationChannel';
import { formatLime, type ConfirmedCharge } from '../lime';
import { useDocumentTitle } from '../use-document-title';
import form from './AuthForm.module.css';
import type { LoginPageState } from './LoginPage';

interface ConfirmRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
}

type Confirmation =
  | { status: 'confirming' }
  | { status: 'done'; charge: ConfirmedCharge }
  | { status: 'failed'; message: string };

function parseQuery(
  paymentKey: string | null,
  orderId: string | null,
  amountParam: string | null,
): ConfirmRequest | null {
  const amount = Number(amountParam);
  if (!paymentKey || !orderId || !Number.isInteger(amount) || amount <= 0) {
    return null;
  }
  return { paymentKey, orderId, amount };
}

function confirmErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 403:
        return '권한이 없습니다.';
      case 404:
        return '충전 주문을 찾을 수 없습니다.';
      case 400:
      case 409:
      case 502:
      case 503:
        if (err.serverMessage) return err.serverMessage;
    }
  }
  return '결제를 확인하지 못했습니다. 페이지를 새로 고쳐 다시 시도해 주세요.';
}

// 구매자가 승인하면 Toss가 이곳으로 리디렉션한다. 라임은 API의 confirm만
// 적립한다. 새로고침하면 다시 confirm하고 같은 응답을 받는다.
export function LimeChargeSuccessPage() {
  useDocumentTitle('라임 충전');
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const paymentKey = params.get('paymentKey');
  const orderId = params.get('orderId');
  const amountParam = params.get('amount');
  const request = useMemo(
    () => parseQuery(paymentKey, orderId, amountParam),
    [paymentKey, orderId, amountParam],
  );
  const requestKey = request
    ? `${request.orderId}:${request.paymentKey}:${request.amount}`
    : null;
  const [result, setResult] = useState<{
    key: string;
    confirmation: Confirmation;
  } | null>(null);
  // StrictMode가 effect를 두 번 돌려도 남으므로, 마운트마다 한 번만 confirm한다.
  const sentFor = useRef<string | null>(null);
  const loginPath = location.pathname + location.search;

  useEffect(() => {
    if (!request || !requestKey || sentFor.current === requestKey) return;
    sentFor.current = requestKey;
    apiFetch<ConfirmedCharge>('/lime/charges/confirm', {
      method: 'POST',
      body: JSON.stringify(request),
    }).then(
      (charge) => {
        setResult({
          key: requestKey,
          confirmation: { status: 'done', charge },
        });
        announceCharge();
      },
      (err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          const next: LoginPageState = { from: loginPath };
          void navigate('/login', { state: next });
          return;
        }
        setResult({
          key: requestKey,
          confirmation: { status: 'failed', message: confirmErrorMessage(err) },
        });
      },
    );
  }, [request, requestKey, loginPath, navigate]);

  const confirmation: Confirmation = !request
    ? { status: 'failed', message: '결제 정보가 올바르지 않습니다.' }
    : result?.key === requestKey
      ? result.confirmation
      : { status: 'confirming' };

  if (confirmation.status === 'confirming') {
    return (
      <section className={form.card}>
        <h1 className={form.title}>라임 충전</h1>
        <p className={form.notice}>결제를 확인하는 중입니다.</p>
      </section>
    );
  }
  const backButton = (
    <button
      type="button"
      className={`${form.submit} ${form.block}`}
      onClick={() => closeTabOr('/', (to) => void navigate(to))}
    >
      돌아가기
    </button>
  );
  if (confirmation.status === 'failed') {
    return (
      <section className={form.card}>
        <h1 className={form.title}>충전하지 못했습니다</h1>
        <p className={form.error} role="alert">
          {confirmation.message}
        </p>
        {backButton}
        <p className={form.footer}>
          <Link to="/lime/charge">다시 충전하기</Link>
        </p>
      </section>
    );
  }
  const { charge } = confirmation;
  return (
    <section className={form.card}>
      <h1 className={form.title}>충전했습니다.</h1>
      <p className={form.notice}>
        {formatLime(charge.amount)}을 충전했습니다. 잔액은{' '}
        {formatLime(charge.balanceAfter)}입니다.
      </p>
      {backButton}
    </section>
  );
}
