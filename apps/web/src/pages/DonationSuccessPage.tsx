import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { formatWon, type ConfirmedDonation } from '../donations';
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
  | { status: 'done'; donation: ConfirmedDonation }
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
        return '주문을 찾을 수 없습니다.';
      case 400:
      case 409:
      case 502:
      case 503:
        if (err.serverMessage) return err.serverMessage;
    }
  }
  return '결제를 확인하지 못했습니다. 페이지를 새로 고쳐 다시 시도해 주세요.';
}

// Toss redirects here after the buyer approves. Only the API's confirm turns
// the order into a donation.
export function DonationSuccessPage() {
  useDocumentTitle('후원하기');
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
  // StrictMode runs this effect twice on mount; the ref survives that, so
  // each payment is confirmed once per mount. A refresh is a new mount and
  // confirms again, which the API answers with the same donation.
  const sentFor = useRef<string | null>(null);
  const loginPath = location.pathname + location.search;

  useEffect(() => {
    if (!request || !requestKey || sentFor.current === requestKey) return;
    sentFor.current = requestKey;
    apiFetch<ConfirmedDonation>('/donations/confirm', {
      method: 'POST',
      body: JSON.stringify(request),
    }).then(
      (donation) =>
        setResult({
          key: requestKey,
          confirmation: { status: 'done', donation },
        }),
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
        <h1 className={form.title}>후원하기</h1>
        <p className={form.notice}>결제를 확인하는 중입니다.</p>
      </section>
    );
  }
  if (confirmation.status === 'failed') {
    return (
      <section className={form.card}>
        <h1 className={form.title}>후원하지 못했습니다</h1>
        <p className={form.error} role="alert">
          {confirmation.message}
        </p>
        <p className={form.footer}>
          <Link to="/">방송 목록으로 가기</Link>
        </p>
      </section>
    );
  }
  const { donation } = confirmation;
  return (
    <section className={form.card}>
      <h1 className={form.title}>후원했습니다.</h1>
      <p className={form.notice}>
        {formatWon(donation.amount)}을 후원했습니다.
        {donation.message && ` 메시지: ${donation.message}`}
      </p>
      <p className={form.footer}>
        <Link to={`/broadcasts/${donation.broadcastId}`}>
          방송으로 돌아가기
        </Link>
      </p>
    </section>
  );
}
