import { Link, useNavigate, useSearchParams } from 'react-router';
import { closeTabOr, returnToBroadcast } from '../donation/paymentNotice';
import { inFrame } from '../donation/paymentFrame';
import { broadcastOfOrder } from '../donations';
import { useDocumentTitle } from '../use-document-title';
import form from './AuthForm.module.css';

// 구매자가 결제 창을 닫았을 때 Toss가 주는 코드.
const CANCELED = 'PAY_PROCESS_CANCELED';

export function DonationFailPage() {
  useDocumentTitle('후원하기');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get('code');
  const orderId = params.get('orderId');
  const broadcastId = orderId ? broadcastOfOrder(orderId) : null;
  const canceled = code === CANCELED;

  return (
    <section className={form.card}>
      <h1 className={form.title}>
        {canceled ? '결제를 취소했습니다.' : '결제하지 못했습니다'}
      </h1>
      {!canceled && (
        <p className={form.error} role="alert">
          {params.get('message') ?? '결제 중 문제가 생겼습니다.'}
        </p>
      )}
      {/* 후원 모달 안 iframe이면 돌아갈 방송을 몰라도 모달의 폼으로 돌아간다. */}
      {(broadcastId || inFrame()) && (
        <button
          type="button"
          className={`${form.submit} ${form.block}`}
          onClick={() => {
            const go = (to: string) => void navigate(to);
            if (broadcastId) returnToBroadcast(broadcastId, go);
            else closeTabOr('/', go);
          }}
        >
          {/* 모달 안에서는 이미 방송 화면이라 폼으로 돌아간다. */}
          {inFrame() ? '돌아가기' : '방송으로 돌아가기'}
        </button>
      )}
      <p className={form.footer}>
        {broadcastId ? (
          <Link to={`/broadcasts/${broadcastId}/donate`}>다시 후원하기</Link>
        ) : (
          <Link to="/" className={form.hiddenInFrame}>
            방송 목록으로 가기
          </Link>
        )}
      </p>
    </section>
  );
}
