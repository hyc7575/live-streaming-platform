import { Link } from 'react-router';
import type { Broadcast } from '../broadcasts';
import styles from './BroadcastGrid.module.css';
import { BroadcastThumbnail } from './BroadcastThumbnail';

function watchPath(b: Broadcast): string {
  return `/broadcasts/${b.id}`;
}

export function BroadcastGrid({
  broadcasts,
  linkTo = watchPath,
}: {
  broadcasts: Broadcast[];
  // Where each card goes. Defaults to the watch page, as on the public list.
  linkTo?: (b: Broadcast) => string;
}) {
  return (
    <ul className={styles.grid}>
      {broadcasts.map((b) => (
        <li key={b.id}>
          <Link to={linkTo(b)} className={styles.card}>
            <div className={styles.thumbnail}>
              <BroadcastThumbnail broadcast={b} />
            </div>
            <p className={styles.title}>{b.title}</p>
            <p className={styles.streamer}>{b.streamer.nickname}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
