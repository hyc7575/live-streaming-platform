import { Link } from 'react-router';
import type { Broadcast } from '../broadcasts';
import styles from './BroadcastGrid.module.css';
import { StatusBadge } from './StatusBadge';

export function BroadcastGrid({ broadcasts }: { broadcasts: Broadcast[] }) {
  return (
    <ul className={styles.grid}>
      {broadcasts.map((b) => (
        <li key={b.id}>
          <Link to={`/broadcasts/${b.id}`} className={styles.card}>
            <div className={styles.thumbnail}>
              <span className={styles.badge}>
                <StatusBadge status={b.status} />
              </span>
            </div>
            <p className={styles.title}>{b.title}</p>
            <p className={styles.streamer}>{b.streamer.nickname}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
