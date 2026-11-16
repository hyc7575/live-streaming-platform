import { Link, useNavigate } from 'react-router';
import { closeTabOr } from '../donation/paymentNotice';
import { useConfirmPayment } from '../donation/useConfirmPayment';
import { formatLime } from '../lime';
import { useDocumentTitle } from '../use-document-title';
import form from './AuthForm.module.css';

// 구매자가 승인하면 Toss가 이곳으로 리디렉션한다. 라임은 API의 confirm만
// 적립한다. 확정과 시청 화면 알림은 `useConfirmPayment`가 한 번만 한다.
export function LimeChargeSuccessPage() {
  useDocumentTitle('라임 충전');
  const navigate = useNavigate();
  const confirmation = useConfirmPayment('charge');

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
  const charge = confirmation.result;
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
