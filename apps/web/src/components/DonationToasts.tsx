import { useEffect, useEffectEvent } from 'react';
import { formatDonationAmount, type Donation } from '../donations';
import styles from './DonationToasts.module.css';

// 토스트 한 장이 떠 있는 시간.
export const DONATION_TOAST_MS = 6000;

/**
 * 새 후원 토스트 묶음. 들어온 순서대로 아래로 쌓고, 한 장마다 6초 뒤
 * `onExpire`로 내린다. 영역은 늘 그려 두어, 토스트가 들어올 때 화면 읽기
 * 프로그램이 읽게 한다.
 */
export function DonationToasts({
  donations,
  onExpire,
}: {
  donations: Donation[];
  onExpire: (id: string) => void;
}) {
  return (
    <div className={styles.toasts} aria-live="polite">
      {donations.map((d) => (
        <Toast key={d.id} donation={d} onExpire={onExpire} />
      ))}
    </div>
  );
}

function Toast({
  donation,
  onExpire,
}: {
  donation: Donation;
  onExpire: (id: string) => void;
}) {
  const expire = useEffectEvent(() => onExpire(donation.id));
  useEffect(() => {
    const timer = setTimeout(expire, DONATION_TOAST_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className={styles.toast}>
      <p className={styles.title}>
        {`${donation.donor.nickname}님이 ${formatDonationAmount(donation)} 후원`}
      </p>
      {donation.message && <p className={styles.message}>{donation.message}</p>}
    </div>
  );
}
