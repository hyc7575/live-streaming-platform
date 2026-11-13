import { Link } from 'react-router';
import { channelPath } from '../streamers';
import type { FollowEntry } from './follows';
import styles from './FollowList.module.css';

function Item({ entry }: { entry: FollowEntry }) {
  const body = (
    <>
      <span className={styles.avatar} aria-hidden="true">
        {entry.nickname.slice(0, 1)}
        {entry.live && <span className={styles.liveDot} />}
      </span>
      <span className={styles.text}>
        <span className={styles.nickname}>{entry.nickname}</span>
        <span className={styles.sub}>
          {entry.live ? entry.live.title : '오프라인'}
        </span>
      </span>
    </>
  );
  // A LIVE streamer opens their broadcast, an offline one their channel.
  return (
    <li>
      {entry.live ? (
        <Link
          to={`/broadcasts/${entry.live.broadcastId}`}
          className={styles.item}
          title={`${entry.nickname} · ${entry.live.title}`}
        >
          {body}
        </Link>
      ) : (
        <Link
          to={channelPath(entry.streamerId)}
          className={`${styles.item} ${styles.offline}`}
          title={entry.nickname}
        >
          {body}
        </Link>
      )}
    </li>
  );
}

// `collapsible` lets the left panel fold to avatars on mid-width screens.
export function FollowList({
  entries,
  collapsible = false,
}: {
  entries: FollowEntry[];
  collapsible?: boolean;
}) {
  return (
    <ul
      className={
        collapsible ? `${styles.list} ${styles.collapsible}` : styles.list
      }
    >
      {entries.map((entry) => (
        <Item key={entry.key} entry={entry} />
      ))}
    </ul>
  );
}
