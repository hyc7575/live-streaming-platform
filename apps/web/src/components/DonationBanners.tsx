import type { DonationAlert } from '../donation/donationAlerts';
import { DonationAlertCard } from './DonationAlertCard';
import styles from './DonationBanners.module.css';

/**
 * 시청 화면 플레이어 위의 새 후원 배너(S5). 표시 순서는 송출 토스트와 같은
 * 큐(`donation/donationAlerts`, S6)가 정하고, 여기서는 지금 장 하나만 그린다.
 * 플레이어 컨테이너 안에 그려야 컨테이너 전체 화면에서도 보인다. 영역은 늘
 * 그려 두어, 배너가 들어올 때 화면 읽기 프로그램이 읽게 한다. 클릭은 아래
 * 영상과 컨트롤로 지나간다(CSS `pointer-events: none`).
 */
export function DonationBanners({
  alert,
  onExpire,
}: {
  alert: DonationAlert | null;
  onExpire: () => void;
}) {
  return (
    <div className={styles.banners} aria-live="polite">
      {alert && (
        <DonationAlertCard
          key={alert.key}
          alert={alert}
          onExpire={onExpire}
          classNames={{
            card: styles.banner,
            title: styles.title,
            message: styles.message,
          }}
        />
      )}
    </div>
  );
}
