import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ApiError, apiFetch } from '../api';
import {
  announceDonation,
  returnToBroadcast,
} from '../donation/donationChannel';
import {
  broadcastOfOrder,
  formatWon,
  type ConfirmedDonation,
} from '../donations';
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
  // `broadcastGone`: 방송이 지워져 confirm이 거절됐다
  // (#114). 그래서 돌아갈 방송이 없다.
  | { status: 'failed'; message: string; broadcastGone?: boolean };

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

// 방송이 지워져 confirm이 거절됐을 때 API가 주는 코드.
const BROADCAST_DELETED_CODE = 'BROADCAST_DELETED';

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

// 구매자가 승인하면 Toss가 이곳으로 리디렉션한다. 주문을 후원으로 바꾸는
// 것은 API의 confirm뿐이다.
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
  // StrictMode는 마운트할 때 이 effect를 두 번 돌린다. ref는 그래도 남으므로
  // 결제마다 마운트당 한 번만 confirm한다. 새로고침은 새 마운트라
  // 다시 confirm하고, API는 같은 후원으로 응답한다.
  const sentFor = useRef<string | null>(null);
  const loginPath = location.pathname + location.search;

  useEffect(() => {
    if (!request || !requestKey || sentFor.current === requestKey) return;
    sentFor.current = requestKey;
    apiFetch<ConfirmedDonation>('/donations/confirm', {
      method: 'POST',
      body: JSON.stringify(request),
    }).then(
      (donation) => {
        setResult({
          key: requestKey,
          confirmation: { status: 'done', donation },
        });
        if (donation.broadcastId) announceDonation(donation.broadcastId);
      },
      (err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          const next: LoginPageState = { from: loginPath };
          void navigate('/login', { state: next });
          return;
        }
        setResult({
          key: requestKey,
          confirmation: {
            status: 'failed',
            message: confirmErrorMessage(err),
            broadcastGone:
              err instanceof ApiError &&
              err.serverCode === BROADCAST_DELETED_CODE,
          },
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
  const backButton = (broadcastId: string) => (
    <button
      type="button"
      className={`${form.submit} ${form.block}`}
      onClick={() => returnToBroadcast(broadcastId, (to) => void navigate(to))}
    >
      방송으로 돌아가기
    </button>
  );

  if (confirmation.status === 'failed') {
    // 주문한 탭에서만 안다.
    const broadcastId =
      orderId && !confirmation.broadcastGone ? broadcastOfOrder(orderId) : null;
    return (
      <section className={form.card}>
        <h1 className={form.title}>후원하지 못했습니다</h1>
        <p className={form.error} role="alert">
          {confirmation.message}
        </p>
        {broadcastId && backButton(broadcastId)}
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
      {donation.broadcastId ? (
        backButton(donation.broadcastId)
      ) : (
        // 결제한 뒤에 방송이 지워졌다 (#114).
        <p className={form.footer}>
          <Link to="/">방송 목록으로 가기</Link>
        </p>
      )}
    </section>
  );
}
