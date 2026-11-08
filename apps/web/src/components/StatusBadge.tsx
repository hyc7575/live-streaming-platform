import styles from './StatusBadge.module.css';

export type BroadcastStatus = 'READY' | 'LIVE' | 'ENDED';

const BADGE: Record<BroadcastStatus, { label: string; className: string }> = {
  READY: { label: '방송 전', className: styles.ready },
  LIVE: { label: 'LIVE', className: styles.live },
  ENDED: { label: '방송 종료', className: styles.ended },
};

export function StatusBadge({ status }: { status: BroadcastStatus }) {
  const { label, className } = BADGE[status];
  return <span className={`${styles.badge} ${className}`}>{label}</span>;
}
