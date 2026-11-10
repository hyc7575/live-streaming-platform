import { useState } from 'react';
import type { Broadcast } from '../broadcasts';
import styles from './BroadcastThumbnail.module.css';
import { ElapsedTime } from './ElapsedTime';
import { type BroadcastStatus, StatusBadge } from './StatusBadge';

const TINT: Record<BroadcastStatus, string> = {
  READY: styles.ready,
  LIVE: styles.live,
  ENDED: styles.ended,
};

// The streamer's captured frame when there is one, otherwise the title's
// first letter. An image that fails to load falls back to the letter until
// the URL changes.
export function BroadcastThumbnail({
  broadcast,
}: {
  broadcast: Pick<Broadcast, 'title' | 'status' | 'startedAt' | 'thumbnailUrl'>;
}) {
  const { title, status, startedAt, thumbnailUrl } = broadcast;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initial = (Array.from(title.trim())[0] ?? '').toUpperCase();
  return (
    <div className={`${styles.thumbnail} ${TINT[status]}`}>
      {thumbnailUrl && thumbnailUrl !== failedUrl ? (
        // The title sits right under the card image, so alt stays empty.
        <img
          className={styles.image}
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(thumbnailUrl)}
        />
      ) : (
        <span className={styles.initial} aria-hidden="true">
          {initial}
        </span>
      )}
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
