import type { DonationAlert } from '../donation/donationAlerts';
import { DonationAlertCard } from './DonationAlertCard';
import styles from './DonationToasts.module.css';

/**
 * 송출 화면 새 후원 토스트(S1). 표시 순서는 시청 배너와 같은 큐
 * (`donation/donationAlerts`, S6)가 정하고, 여기서는 지금 장 하나만 그린다.
 * 영역은 늘 그려 두어, 토스트가 들어올 때 화면 읽기 프로그램이 읽게 한다.
 */
export function DonationToasts({
  alert,
  onExpire,
}: {
  alert: DonationAlert | null;
  onExpire: () => void;
}) {
  return (
    <div className={styles.toasts} aria-live="polite">
      {alert && (
        <DonationAlertCard
          key={alert.key}
          alert={alert}
          onExpire={onExpire}
          classNames={{
            card: styles.toast,
            title: styles.title,
            message: styles.message,
          }}
        />
      )}
    </div>
  );
}
