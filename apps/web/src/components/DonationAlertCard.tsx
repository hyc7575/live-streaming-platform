import { useEffect, useEffectEvent } from 'react';
import {
  DONATION_ALERT_MS,
  type DonationAlert,
} from '../donation/donationAlerts';
import { formatDonationAmount } from '../donations';

// 송출 토스트와 시청 배너가 같이 쓰는 알림 한 장. 모양은 부르는 쪽 CSS가
// 정한다. `alert.key`로 다시 그려야 장마다 6초 타이머가 새로 시작한다.
export function DonationAlertCard({
  alert,
  onExpire,
  classNames,
}: {
  alert: DonationAlert;
  onExpire: () => void;
  classNames: { card: string; title: string; message: string };
}) {
  const expire = useEffectEvent(onExpire);
  useEffect(() => {
    const timer = setTimeout(expire, DONATION_ALERT_MS);
    return () => clearTimeout(timer);
  }, []);
  const message = alert.kind === 'donation' ? alert.donation.message : '';
  return (
    <div className={classNames.card}>
      <p className={classNames.title}>{alertTitle(alert)}</p>
      {message && <p className={classNames.message}>{message}</p>}
    </div>
  );
}

function alertTitle(alert: DonationAlert): string {
  if (alert.kind === 'more') return `외 ${alert.count}건 후원`;
  const { donation } = alert;
  return `${donation.donor.nickname}님이 ${formatDonationAmount(donation)} 후원`;
}
