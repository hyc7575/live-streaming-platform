import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import { onDonation, openDonateTab } from '../donation/donationChannel';
import {
  formatDonationAmount,
  formatWon,
  type DonationSummary,
} from '../donations';
import type { LoginPageState } from '../pages/LoginPage';
import { usePolledApi } from '../use-api';
import styles from './DonationPanel.module.css';
import { LimeDonationForm } from './LimeDonationForm';

// 댓글과 같은 주기(PRD §8.2: 실시간 push 없음).
const DONATION_POLL_MS = 5000;
// 결제 탭이 결과를 알린 뒤 "후원이 반영되었습니다"가 남아 있는 시간.
const DONATED_NOTICE_MS = 4000;

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function DonationPanel({
  broadcast,
}: {
  broadcast: Pick<Broadcast, 'id' | 'status' | 'streamer'>;
}) {
  const { state } = useAuth();
  const { data: summary, reload } = usePolledApi<DonationSummary>(
    `/broadcasts/${encodeURIComponent(broadcast.id)}/donations`,
    DONATION_POLL_MS,
  );
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
            type="button"
            className={styles.donate}
            onClick={() => openDonateTab(broadcast.id)}
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
      {canDonate && (
        <LimeDonationForm
          broadcastId={broadcast.id}
          onDonated={() => {
            reload();
            setDonatedAt(Date.now());
          }}
          onUnsettled={reload}
        />
      )}
      {live && state.status === 'anonymous' && (
        <Link to="/login" state={loginState} className={styles.login}>
          로그인하고 후원해 보세요
        </Link>
      )}
      {summary.status === 'failed' && (
        <p className={styles.empty}>후원 내역을 불러오지 못했습니다.</p>
      )}
      {loaded && loaded.donations.length === 0 && (
        <p className={styles.empty}>아직 후원이 없습니다.</p>
      )}
      {loaded && loaded.donations.length > 0 && (
        <ol className={styles.list}>
          {loaded.donations.map((d) => (
            <li key={d.id} className={styles.item}>
              <div className={styles.meta}>
                <span className={styles.donor}>{d.donor.nickname}</span>
                <span className={styles.amount}>{formatDonationAmount(d)}</span>
                <time dateTime={d.approvedAt} className={styles.time}>
                  {timeFormat.format(new Date(d.approvedAt))}
                </time>
              </div>
              {d.message && <p className={styles.message}>{d.message}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
