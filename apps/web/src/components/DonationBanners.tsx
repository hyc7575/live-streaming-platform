import { useEffect, useEffectEvent } from 'react';
import { formatDonationAmount, type Donation } from '../donations';
import styles from './DonationBanners.module.css';

// 배너 한 장이 떠 있는 시간. 송출 화면 토스트(#159)와 같다.
export const DONATION_BANNER_MS = 6000;

/**
 * 시청 화면 플레이어 위의 새 후원 배너 묶음(S5). 플레이어 컨테이너 안에
 * 그려야 컨테이너 전체 화면에서도 보인다. 한 장마다 6초 뒤 `onExpire`로
 * 내린다. 영역은 늘 그려 두어, 배너가 들어올 때 화면 읽기 프로그램이 읽게
 * 한다. 클릭은 아래 영상과 컨트롤로 지나간다(CSS `pointer-events: none`).
 */
export function DonationBanners({
  donations,
  onExpire,
}: {
  donations: Donation[];
  onExpire: (id: string) => void;
}) {
  return (
    <div className={styles.banners} aria-live="polite">
      {donations.map((d) => (
        <Banner key={d.id} donation={d} onExpire={onExpire} />
      ))}
    </div>
  );
}

function Banner({
  donation,
  onExpire,
}: {
  donation: Donation;
  onExpire: (id: string) => void;
}) {
  const expire = useEffectEvent(() => onExpire(donation.id));
  useEffect(() => {
    const timer = setTimeout(expire, DONATION_BANNER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className={styles.banner}>
      <p className={styles.title}>
        {`${donation.donor.nickname}님이 ${formatDonationAmount(donation)} 후원`}
      </p>
      {donation.message && <p className={styles.message}>{donation.message}</p>}
    </div>
  );
}
