import { Link } from 'react-router';
import { useAuth } from '../auth/auth-context';
import styles from './FollowPanel.module.css';

// PROTOTYPE: fake data until the follow API exists.
type FollowedStreamer = {
  id: string;
  nickname: string;
  live: { broadcastId: string; title: string } | null;
};

const FAKE_FOLLOWS: FollowedStreamer[] = [
  { id: 's1', nickname: '라임조아', live: { broadcastId: 'x1', title: '오늘은 새벽까지 랭크 올립니다' } },
  { id: 's2', nickname: '모닝커피', live: { broadcastId: 'x2', title: '주말 아침 라디오' } },
  { id: 's3', nickname: '코딩하는곰', live: null },
  { id: 's4', nickname: '산책러', live: null },
];

const FAKE_LIVE = FAKE_FOLLOWS.filter((s) => s.live);

function Item({ streamer }: { streamer: FollowedStreamer }) {
  const initial = streamer.nickname.slice(0, 1);
  const body = (
    <>
      <span className={styles.avatar} aria-hidden="true">
        {initial}
        {streamer.live && <span className={styles.liveDot} />}
      </span>
      <span className={styles.text}>
        <span className={styles.nickname}>{streamer.nickname}</span>
        <span className={styles.sub}>
          {streamer.live ? streamer.live.title : '오프라인'}
        </span>
      </span>
    </>
  );
  return (
    <li>
      {streamer.live ? (
        <Link
          to={`/broadcasts/${streamer.live.broadcastId}`}
          className={styles.item}
          title={`${streamer.nickname} · ${streamer.live.title}`}
        >
          {body}
        </Link>
      ) : (
        <span className={`${styles.item} ${styles.offline}`} title={streamer.nickname}>
          {body}
        </span>
      )}
    </li>
  );
}

export function FollowPanel() {
  const { state } = useAuth();
  if (state.status === 'loading') return <aside className={styles.panel} />;
  const loggedIn = state.status === 'authenticated';
  return (
    <aside className={styles.panel} aria-label={loggedIn ? '팔로우한 스트리머' : 'LIVE 중인 방송'}>
      <h2 className={styles.heading}>
        {loggedIn ? '팔로우한 스트리머' : 'LIVE 중인 방송'}
      </h2>
      <ul className={styles.list}>
        {(loggedIn ? FAKE_FOLLOWS : FAKE_LIVE).map((s) => (
          <Item key={s.id} streamer={s} />
        ))}
      </ul>
      {!loggedIn && (
        <Link to="/login" className={styles.cta}>
          로그인하고 스트리머를 팔로우해 보세요
        </Link>
      )}
    </aside>
  );
}
