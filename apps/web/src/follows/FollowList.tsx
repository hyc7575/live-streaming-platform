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
  // LIVE 스트리머는 방송을, 오프라인 스트리머는 채널을 연다.
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

// `collapsible`이면 중간 너비 화면에서 왼쪽 패널이 아바타만 남기고 접힌다.
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
