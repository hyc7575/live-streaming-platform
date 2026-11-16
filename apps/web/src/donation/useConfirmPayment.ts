import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { ApiError, apiFetch } from '../api';
import type { ConfirmedDonation } from '../donations';
import type { ConfirmedCharge } from '../lime';
import type { LoginPageState } from '../pages/LoginPage';
import type { PaymentKind } from './paymentFrame';
import { announcePayment, type PaymentDone } from './paymentNotice';

// 결제 성공 화면(후원 완료·라임 충전 완료)의 확정 요청과 완료 알림.
// 구매자가 승인하면 Toss가 `paymentKey`·`orderId`·`amount`를 붙여 성공
// 화면으로 리디렉션한다. 결제를 후원·라임으로 바꾸는 것은 API의
// confirm뿐이다. 새로고침하면 다시 confirm하고 API는 같은 결과를 준다.

export type PaymentConfirmation<T> =
  | { status: 'confirming' }
  | { status: 'done'; result: T }
  // `serverCode`는 API가 보낸 `code`다(예: `BROADCAST_DELETED`, #114).
  | { status: 'failed'; message: string; serverCode: string | null };

interface Confirmed {
  donation: ConfirmedDonation;
  charge: ConfirmedCharge;
}

const CONFIRM: {
  [K in PaymentKind]: {
    path: string;
    notFound: string;
    done: (result: Confirmed[K]) => PaymentDone;
  };
} = {
  donation: {
    path: '/donations/confirm',
    notFound: '주문을 찾을 수 없습니다.',
    done: (donation) => ({
      kind: 'donation',
      broadcastId: donation.broadcastId,
    }),
  },
  charge: {
    path: '/lime/charges/confirm',
    notFound: '충전 주문을 찾을 수 없습니다.',
    done: (charge) => ({ kind: 'charge', amount: charge.amount }),
  },
};

interface ConfirmRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
}

const INVALID = {
  status: 'failed',
  message: '결제 정보가 올바르지 않습니다.',
  serverCode: null,
} as const;

// 주소의 결제를 확정하고, 성공하면 지금 자리(새 탭·모달 iframe)의 경로
// 하나로 시청 화면에 알린다. 401이면 로그인 화면으로 보낸다.
export function useConfirmPayment<K extends PaymentKind>(
  kind: K,
): PaymentConfirmation<Confirmed[K]> {
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
    confirmation: PaymentConfirmation<Confirmed[K]>;
  } | null>(null);
  // StrictMode는 마운트할 때 이 effect를 두 번 돌린다. ref는 그래도 남으므로
  // 결제마다 마운트당 한 번만 confirm하고, 그 응답으로 한 번만 알린다.
  const sentFor = useRef<string | null>(null);
  const loginPath = location.pathname + location.search;

  useEffect(() => {
    if (!request || !requestKey || sentFor.current === requestKey) return;
    sentFor.current = requestKey;
    const confirm = CONFIRM[kind];
    apiFetch<Confirmed[K]>(confirm.path, {
      method: 'POST',
      body: JSON.stringify(request),
    }).then(
      (confirmed) => {
        setResult({
          key: requestKey,
          confirmation: { status: 'done', result: confirmed },
        });
        announcePayment(confirm.done(confirmed));
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
            message: confirmErrorMessage(err, confirm.notFound),
            serverCode: err instanceof ApiError ? err.serverCode : null,
          },
        });
      },
    );
  }, [kind, request, requestKey, loginPath, navigate]);

  if (!request) return INVALID;
  return result?.key === requestKey
    ? result.confirmation
    : { status: 'confirming' };
}

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

function confirmErrorMessage(err: unknown, notFound: string): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 403:
        return '권한이 없습니다.';
      case 404:
        return notFound;
      case 400:
      case 409:
      case 502:
      case 503:
        if (err.serverMessage) return err.serverMessage;
    }
  }
  return '결제를 확인하지 못했습니다. 페이지를 새로 고쳐 다시 시도해 주세요.';
}
