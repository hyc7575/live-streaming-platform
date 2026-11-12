import { Link, useNavigate, useSearchParams } from 'react-router';
import { closeTabOr } from '../donation/donationChannel';
import { useDocumentTitle } from '../use-document-title';
import form from './AuthForm.module.css';

// Toss's code when the buyer closed the payment window.
const CANCELED = 'PAY_PROCESS_CANCELED';

export function LimeChargeFailPage() {
  useDocumentTitle('라임 충전');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const canceled = params.get('code') === CANCELED;

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
      <button
        type="button"
        className={`${form.submit} ${form.block}`}
        onClick={() => closeTabOr('/', (to) => void navigate(to))}
      >
        돌아가기
      </button>
      <p className={form.footer}>
        <Link to="/lime/charge">다시 충전하기</Link>
      </p>
    </section>
  );
}
