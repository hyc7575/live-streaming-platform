import { Link } from 'react-router';
import type { Broadcast } from '../broadcasts';
import { channelPath } from '../streamers';
import styles from './BroadcastGrid.module.css';
import { BroadcastThumbnail } from './BroadcastThumbnail';
import { CategoryBadge } from './CategoryBadge';
import { UserAvatar } from './UserAvatar';

function watchPath(b: Broadcast): string {
  return `/broadcasts/${b.id}`;
}

// 카드의 썸네일과 제목은 `linkTo`를 연다. 그 아래 스트리머 닉네임과
// 썸네일 아래 왼쪽의 프로필 원은 채널 페이지로 가는 별도 링크다. 링크 안에
// 링크를 넣을 수 없기 때문이다. 프로필 원 링크는 닉네임 링크와 같은 곳이라
// 탭 순서와 읽기 순서에서 뺀다.
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
        <li
          key={b.id}
          className={showStreamer ? styles.withStreamer : undefined}
        >
          <Link to={linkTo(b)} className={styles.card}>
            <div className={styles.thumbnail}>
              <BroadcastThumbnail broadcast={b} />
            </div>
            <CategoryBadge
              category={b.category}
              game={b.game}
              className={styles.category}
            />
            <p className={styles.title}>{b.title}</p>
          </Link>
          {showStreamer && (
            <>
              <Link
                to={channelPath(b.streamer.id)}
                className={styles.avatarLink}
                tabIndex={-1}
                aria-hidden="true"
              >
                <UserAvatar
                  nickname={b.streamer.nickname}
                  avatarUrl={b.streamer.avatarUrl}
                  className={styles.avatar}
                />
              </Link>
              <Link to={channelPath(b.streamer.id)} className={styles.streamer}>
                {b.streamer.nickname}
              </Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
