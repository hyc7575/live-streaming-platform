import { FollowList } from '../follows/FollowList';
import { FOLLOWS_EMPTY, followedEntries } from '../follows/follows';
import { useFollows } from '../follows/follows-context';
import { useDocumentTitle } from '../use-document-title';
import styles from './ListPage.module.css';

// 왼쪽 패널을 보일 수 없는 좁은 화면에서 쓰는 패널 목록.
export function FollowingPage() {
  useDocumentTitle('팔로잉');
  const { follows } = useFollows();
  return (
    <section>
      <div className={styles.heading}>
        <h1 className={styles.title}>팔로우한 스트리머</h1>
      </div>
      {follows?.status === 'failed' && (
        <p role="alert">팔로우 목록을 불러오지 못했습니다.</p>
      )}
      {follows?.status === 'loaded' &&
        (follows.data.length === 0 ? (
          <p className={styles.empty}>{FOLLOWS_EMPTY}</p>
        ) : (
          <FollowList entries={followedEntries(follows.data)} />
        ))}
    </section>
  );
}
