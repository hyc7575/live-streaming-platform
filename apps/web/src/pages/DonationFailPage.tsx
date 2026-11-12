import { Link, useNavigate, useSearchParams } from 'react-router';
import { returnToBroadcast } from '../donation/donationChannel';
import { broadcastOfOrder } from '../donations';
import { useDocumentTitle } from '../use-document-title';
import form from './AuthForm.module.css';

// Toss's code when the buyer closed the payment window.
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
      {broadcastId && (
        <button
          type="button"
          className={`${form.submit} ${form.block}`}
          onClick={() =>
            returnToBroadcast(broadcastId, (to) => void navigate(to))
          }
        >
          방송으로 돌아가기
        </button>
      )}
      <p className={form.footer}>
        {broadcastId ? (
          <Link to={`/broadcasts/${broadcastId}/donate`}>다시 후원하기</Link>
        ) : (
          <Link to="/">방송 목록으로 가기</Link>
        )}
      </p>
    </section>
  );
}
