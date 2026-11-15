import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import {
  onDonation,
  openChargeTab,
  openDonateTab,
} from '../donation/donationChannel';
import {
  paymentPath,
  readPaymentMessage,
  type PaymentFrameMessage,
  type PaymentKind,
} from '../donation/paymentFrame';
import {
  formatWon,
  type DonationRank,
  type DonationSummary,
} from '../donations';
import type { LoginPageState } from '../pages/LoginPage';
import type { Loadable } from '../use-api';
import styles from './DonationPanel.module.css';
import { LimeDonationForm } from './LimeDonationForm';

// 결제 탭이 결과를 알린 뒤 "후원이 반영되었습니다"가 남아 있는 시간.
const DONATED_NOTICE_MS = 4000;

// 합계·건수와 후원자별 누적만 보인다. 개별 후원과 메시지는 채팅의 후원
// 줄에 있다(#166). 후원 목록 API는 그대로 개별 내역을 준다. 후원 목록은
// 페이지(`BroadcastPage`)가 읽어 넘긴다. 플레이어 위 새 후원 배너(S5)와
// 같은 5초 폴링 응답을 써서 요청이 늘지 않는다.
//
// `donateIn`은 라임 후원 폼과 결제를 둘 자리다(PRD-donation-modal 7.1).
// 넓은 화면은 "후원하기"가 여는 모달 안이고, 마우스를 쓰는 PC
// (`'modal-with-payment'`)는 충전·카드 결제도 그 모달 안 iframe에서 한다.
// 터치 태블릿(`'modal'`)은 결제를 새 탭으로 연다. 좁은 화면(`'inline'`)은
// 패널 안이다. 좁은 화면의 패널은 이미 `···` 시트(모달) 안에 있어 모달을
// 겹치지 않는다.
export type DonateIn = 'inline' | 'modal' | 'modal-with-payment';

// 후원 모달이 보이는 것. 닫혀도 폼은 마운트해 둔다.
type ModalView =
  | { view: 'closed' }
  | { view: 'form' }
  | { view: 'payment'; kind: PaymentKind };

const CLOSED: ModalView = { view: 'closed' };
const FORM: ModalView = { view: 'form' };

export function DonationPanel({
  broadcast,
  summary,
  reload,
  donateIn,
}: {
  broadcast: Pick<Broadcast, 'id' | 'status' | 'streamer'>;
  summary: Loadable<DonationSummary>;
  reload: () => void;
  donateIn: DonateIn;
}) {
  const { state } = useAuth();
  const [modal, setModal] = useState<ModalView>(CLOSED);
  // 모달 안에서 마친 충전. 폼이 새 잔액과 충전 문구를 보인다.
  const [charged, setCharged] = useState<{ amount: number } | null>(null);
  const donateRef = useRef<HTMLButtonElement>(null);
  // 메시지마다 올려서, 두 번째 후원이 알림 타이머를 다시 시작하게 한다.
  const [donatedAt, setDonatedAt] = useState<number | null>(null);

  useEffect(
    () =>
      onDonation(broadcast.id, () => {
        reload();
        setDonatedAt(Date.now());
      }),
    [broadcast.id, reload],
  );

  useEffect(() => {
    if (donatedAt === null) return;
    const timer = setTimeout(() => setDonatedAt(null), DONATED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [donatedAt]);
  const live = broadcast.status === 'LIVE';
  const canDonate =
    live &&
    state.status === 'authenticated' &&
    state.user.id !== broadcast.streamer.id;
  const loginState: LoginPageState = { from: `/broadcasts/${broadcast.id}` };
  const loaded = summary.status === 'loaded' ? summary.data : null;
  const inModal = donateIn !== 'inline';
  const modalOpen = modal.view !== 'closed';
  const donated = () => {
    reload();
    setDonatedAt(Date.now());
  };
  const setModalOpen = (open: boolean) => {
    setModal(open ? FORM : CLOSED);
    setCharged(null);
  };
  const pay = (kind: PaymentKind) => {
    if (donateIn === 'modal-with-payment') {
      setModal({ view: 'payment', kind });
      setCharged(null);
    } else if (kind === 'charge') openChargeTab();
    else openDonateTab(broadcast.id);
  };
  const onPaymentMessage = (message: PaymentFrameMessage) => {
    if (message.type === 'payment-close') {
      setModal(FORM);
    } else if (message.kind === 'charge') {
      setModal(FORM);
      setCharged({ amount: message.amount });
    } else {
      donated();
      setModal(CLOSED);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="donations-heading">
      <div className={styles.header}>
        <h2 id="donations-heading" className={styles.heading}>
          후원
        </h2>
        {loaded && (
          <p className={styles.total}>
            <strong>{formatWon(loaded.total)}</strong>
            <span className={styles.count}>{loaded.count}건</span>
          </p>
        )}
        {canDonate && (
          <button
            ref={donateRef}
            type="button"
            className={styles.donate}
            aria-haspopup={inModal ? 'dialog' : undefined}
            aria-expanded={inModal ? modalOpen : undefined}
            onClick={() =>
              inModal ? setModalOpen(true) : openDonateTab(broadcast.id)
            }
          >
            후원하기
          </button>
        )}
      </div>
      {/* 늘 마운트해 두어, 문구가 들어올 때 스크린 리더가 읽게 한다. */}
      <div className={styles.status} role="status">
        {donatedAt !== null && (
          <p className={styles.donated}>후원이 반영되었습니다</p>
        )}
      </div>
      {canDonate &&
        (inModal ? (
          <DonationModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            returnFocusTo={donateRef}
            payment={
              modal.view === 'payment'
                ? {
                    kind: modal.kind,
                    src: paymentPath(modal.kind, broadcast.id),
                    onBack: () => setModal(FORM),
                    onMessage: onPaymentMessage,
                  }
                : null
            }
          >
            <LimeDonationForm
              broadcastId={broadcast.id}
              offerCard="always"
              onDonated={() => {
                donated();
                setModalOpen(false);
              }}
              onUnsettled={reload}
              onPay={pay}
              charged={charged}
            />
          </DonationModal>
        ) : (
          <LimeDonationForm
            broadcastId={broadcast.id}
            offerCard="whenShort"
            onDonated={donated}
            onUnsettled={reload}
            onPay={pay}
          />
        ))}
      {live && state.status === 'anonymous' && (
        <Link to="/login" state={loginState} className={styles.login}>
          로그인하고 후원해 보세요
        </Link>
      )}
      {summary.status === 'failed' && (
        <p className={styles.empty}>후원 내역을 불러오지 못했습니다.</p>
      )}
      {loaded && loaded.count === 0 && (
        <p className={styles.empty}>아직 후원이 없습니다.</p>
      )}
      {loaded && loaded.ranking.length > 0 && (
        <DonationRanking ranking={loaded.ranking} />
      )}
    </section>
  );
}

const PAYMENT_TITLE: Record<PaymentKind, string> = {
  charge: '라임 충전',
  donation: '카드로 후원',
};

interface PaymentView {
  kind: PaymentKind;
  src: string;
  onBack: () => void;
  onMessage: (message: PaymentFrameMessage) => void;
}

// 닫혀도 children(폼)을 마운트해 두어, 응답을 잃은 시도의 멱등 키가
// 모달을 다시 열어도 남는다. 결제 보기(`payment`)일 때도 폼을 숨기기만 해
// 고른 금액·메시지·멱등 키가 남는다. iframe은 결제 보기일 때만 그린다.
function DonationModal({
  open,
  onOpenChange,
  returnFocusTo,
  payment,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
  payment: PaymentView | null;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const paying = payment !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open === open) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  // 누른 버튼이 결제 보기와 함께 숨으므로 포커스를 모달 안에 둔다.
  const wasPaying = useRef(paying);
  useEffect(() => {
    if (wasPaying.current === paying) return;
    wasPaying.current = paying;
    if (paying) backRef.current?.focus();
    else if (dialogRef.current?.open) closeRef.current?.focus();
  }, [paying]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.modal}
      data-view={paying ? 'payment' : 'form'}
      aria-labelledby={headingId}
      onClose={() => {
        onOpenChange(false);
        returnFocusTo.current?.focus();
      }}
      onClick={(e) => {
        // 내용이 dialog 상자를 채우므로 dialog 자체에 닿는 클릭은 배경뿐이다.
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          {payment && (
            <button
              ref={backRef}
              type="button"
              className={styles.back}
              onClick={payment.onBack}
            >
              <span aria-hidden="true">‹</span> 뒤로
            </button>
          )}
          <h2 id={headingId} className={styles.modalTitle}>
            {payment ? PAYMENT_TITLE[payment.kind] : '후원하기'}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            onClick={() => onOpenChange(false)}
          >
            닫기
          </button>
        </div>
        <div className={styles.modalForm} hidden={paying}>
          {children}
        </div>
        {payment && <PaymentFrame {...payment} />}
      </div>
    </dialog>
  );
}

// 모달 안 결제 화면(PRD-donation-modal 7.3). 같은 출처이고 이 iframe이
// 보낸 메시지만 받는다.
function PaymentFrame({ kind, src, onMessage }: PaymentView) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const message = readPaymentMessage(
        event,
        frameRef.current?.contentWindow ?? null,
      );
      if (message) onMessageRef.current(message);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return (
    <iframe
      ref={frameRef}
      className={styles.frame}
      src={src}
      title={`${PAYMENT_TITLE[kind]} 결제`}
    />
  );
}

// 후원자별 누적(최대 50명, 서버가 정렬)을 그대로 그린다. 금액은 카드와
// 라임을 합친 값이라 수단과 관계없이 원으로 적는다.
function DonationRanking({ ranking }: { ranking: DonationRank[] }) {
  return (
    <div className={styles.ranking}>
      <h3 id="donation-ranking-heading" className={styles.subheading}>
        후원 순위
      </h3>
      <ol className={styles.ranks} aria-labelledby="donation-ranking-heading">
        {ranking.map((rank, index) => (
          <li key={rank.donor.id} className={styles.rank}>
            <span className={styles.place}>{index + 1}</span>
            <span className={styles.rankDonor}>{rank.donor.nickname}</span>
            <span className={styles.amount}>{formatWon(rank.total)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
