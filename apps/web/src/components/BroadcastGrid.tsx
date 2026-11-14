import { Link } from 'react-router';
import type { Broadcast } from '../broadcasts';
import { channelPath } from '../streamers';
import styles from './BroadcastGrid.module.css';
import { BroadcastThumbnail } from './BroadcastThumbnail';

function watchPath(b: Broadcast): string {
  return `/broadcasts/${b.id}`;
}

// 카드의 썸네일과 제목은 `linkTo`를 연다. 그 아래 스트리머 닉네임은
// 채널 페이지로 가는 별도 링크다. 링크 안에 링크를 넣을 수
// 없기 때문이다.
export function BroadcastGrid({
  broadcasts,
  linkTo = watchPath,
  showStreamer = true,
}: {
  broadcasts: Broadcast[];
  // 각 카드가 여는 곳. 기본값은 공개 목록처럼 시청 페이지다.
  linkTo?: (b: Broadcast) => string;
  // 모든 카드가 같은 스트리머의 것인 곳(채널 페이지, 스튜디오)에서는 끈다.
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
