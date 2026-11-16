import { Link, useNavigate, useSearchParams } from 'react-router';
import { broadcastOfOrder, formatWon } from '../donations';
import { inFrame } from '../donation/paymentFrame';
import { closeTabOr, returnToBroadcast } from '../donation/paymentNotice';
import { useConfirmPayment } from '../donation/useConfirmPayment';
import { useDocumentTitle } from '../use-document-title';
import form from './AuthForm.module.css';

// 방송이 지워져 confirm이 거절됐을 때 API가 주는 코드(#114). 그래서
// 돌아갈 방송이 없다.
const BROADCAST_DELETED_CODE = 'BROADCAST_DELETED';

// 구매자가 승인하면 Toss가 이곳으로 리디렉션한다. 확정과 시청 화면
// 알림은 `useConfirmPayment`가 한 번만 한다.
export function DonationSuccessPage() {
  useDocumentTitle('후원하기');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get('orderId');
  const confirmation = useConfirmPayment('donation');

  if (confirmation.status === 'confirming') {
    return (
      <section className={form.card}>
        <h1 className={form.title}>후원하기</h1>
        <p className={form.notice}>결제를 확인하는 중입니다.</p>
      </section>
    );
  }
  // 후원 모달 안 iframe이면 돌아갈 방송을 몰라도 모달의 폼으로 돌아간다.
  const backButton = (broadcastId: string | null) => (
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
  );

  if (confirmation.status === 'failed') {
    // 주문한 탭에서만 안다.
    const broadcastGone = confirmation.serverCode === BROADCAST_DELETED_CODE;
    const broadcastId =
      orderId && !broadcastGone ? broadcastOfOrder(orderId) : null;
    return (
      <section className={form.card}>
        <h1 className={form.title}>후원하지 못했습니다</h1>
        <p className={form.error} role="alert">
          {confirmation.message}
        </p>
        {(broadcastId || inFrame()) && backButton(broadcastId)}
        <p className={`${form.footer} ${form.hiddenInFrame}`}>
          <Link to="/">방송 목록으로 가기</Link>
        </p>
      </section>
    );
  }
  const donation = confirmation.result;
  return (
    <section className={form.card}>
      <h1 className={form.title}>후원했습니다.</h1>
      <p className={form.notice}>
        {formatWon(donation.amount)}을 후원했습니다.
        {donation.message && ` 메시지: ${donation.message}`}
      </p>
      {donation.broadcastId || inFrame() ? (
        backButton(donation.broadcastId)
      ) : (
        // 결제한 뒤에 방송이 지워졌다 (#114).
        <p className={`${form.footer} ${form.hiddenInFrame}`}>
          <Link to="/">방송 목록으로 가기</Link>
        </p>
      )}
    </section>
  );
}
