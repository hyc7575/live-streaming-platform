import { Link } from 'react-router';
import type { Broadcast } from '../broadcasts';
import { channelPath } from '../streamers';
import styles from './BroadcastGrid.module.css';
import { BroadcastThumbnail } from './BroadcastThumbnail';

function watchPath(b: Broadcast): string {
  return `/broadcasts/${b.id}`;
}

// The card's picture and title open `linkTo`; the streamer's nickname under
// them is its own link to their channel page, since a link cannot sit
// inside another.
export function BroadcastGrid({
  broadcasts,
  linkTo = watchPath,
  showStreamer = true,
}: {
  broadcasts: Broadcast[];
  // Where each card goes. Defaults to the watch page, as on the public list.
  linkTo?: (b: Broadcast) => string;
  // Off where every card is the same streamer's: a channel page, the studio.
  showStreamer?: boolean;
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
          </Link>
          {showStreamer && (
            <Link to={channelPath(b.streamer.id)} className={styles.streamer}>
              {b.streamer.nickname}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
