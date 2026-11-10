import type { Broadcast } from '../broadcasts';
import styles from './BroadcastThumbnail.module.css';
import { ElapsedTime } from './ElapsedTime';
import { type BroadcastStatus, StatusBadge } from './StatusBadge';

const TINT: Record<BroadcastStatus, string> = {
  READY: styles.ready,
  LIVE: styles.live,
  ENDED: styles.ended,
};

// Drawn from the title until broadcasts carry an image.
export function BroadcastThumbnail({
  broadcast,
}: {
  broadcast: Pick<Broadcast, 'title' | 'status' | 'startedAt'>;
}) {
  const { title, status, startedAt } = broadcast;
  const initial = (Array.from(title.trim())[0] ?? '').toUpperCase();
  return (
    <div className={`${styles.thumbnail} ${TINT[status]}`}>
      <span className={styles.initial} aria-hidden="true">
        {initial}
      </span>
      <span className={styles.badge}>
        <StatusBadge status={status} />
      </span>
      {status === 'LIVE' && startedAt && (
        <ElapsedTime
          startedAt={startedAt}
          precision="minute"
          className={styles.elapsed}
        />
      )}
    </div>
  );
}
