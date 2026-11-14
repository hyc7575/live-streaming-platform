import type { FollowerList } from '../follows/follows';
import { HISTORY_LIMIT } from '../history';
import { useApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import styles from './History.module.css';
import { HistoryTime } from './HistoryParts';
import listStyles from './ListPage.module.css';

// /studio/followers: 스트리머를 팔로우하는 사람들. 목록은 스트리머만
// 본다. 다른 사람은 수만 보게 된다 (PRD-mypage 7.2).
export function FollowersPage() {
  useDocumentTitle('팔로워');
  const followers = useApi<FollowerList>('/me/followers');

  return (
    <section>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>팔로워</h1>
      </div>
      {followers.status === 'failed' && (
        <p role="alert">팔로워를 불러오지 못했습니다.</p>
      )}
      {followers.status === 'loaded' && (
        <>
          <div className={styles.summary}>
            <p className={styles.summaryText}>
              <span className={styles.muted}>팔로워</span>
              <strong>{followers.data.count.toLocaleString('ko-KR')}명</strong>
            </p>
          </div>
          {followers.data.followers.length === 0 ? (
            <p className={listStyles.empty}>
              아직 팔로워가 없습니다. 시청자가 방송에서 팔로우하면 여기에
              보입니다.
            </p>
          ) : (
            <ol className={styles.list}>
              {followers.data.followers.map((f) => (
                <li key={f.id} className={styles.row}>
                  <span className={styles.avatar} aria-hidden="true">
                    {f.nickname.slice(0, 1)}
                  </span>
                  <div className={styles.main}>
                    <span className={styles.what}>{f.nickname}</span>
                    <span className={styles.muted}>
                      <HistoryTime at={f.followedAt} /> 팔로우
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {followers.data.count > followers.data.followers.length && (
            <p className={styles.note}>최근 {HISTORY_LIMIT}명까지 보입니다.</p>
          )}
        </>
      )}
    </section>
  );
}
