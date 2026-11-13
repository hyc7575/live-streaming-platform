import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import { BroadcastGrid } from '../components/BroadcastGrid';
import { FollowButton } from '../follows/FollowButton';
import { useFollows } from '../follows/follows-context';
import type { StreamerProfile } from '../streamers';
import { useApi, usePolledApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import listStyles from './ListPage.module.css';
import styles from './StreamerPage.module.css';

// Same cadence as the follow panel.
const PROFILE_POLL_MS = 30_000;

// /channels/:id: anyone's view of a streamer, reached from a nickname
// (PRD-mypage 7.3). Their LIVE broadcast first, then the rest of what the
// public list shows of them.
export function StreamerPage() {
  const { id = '' } = useParams();
  const profilePath = `/streamers/${encodeURIComponent(id)}`;
  const profile = usePolledApi<StreamerProfile>(profilePath, PROFILE_POLL_MS);
  const broadcasts = useApi<Broadcast[]>(`${profilePath}/broadcasts`);
  const { state } = useAuth();
  const following = useFollows().isFollowing(id);
  const reloadProfile = profile.reload;
  const loaded = profile.data.status === 'loaded' ? profile.data.data : null;
  useDocumentTitle(loaded?.nickname ?? null);

  // The follower count moves when the visitor follows or unfollows here.
  useEffect(() => {
    reloadProfile();
  }, [following, reloadProfile]);

  if (profile.data.status === 'failed') {
    const { error } = profile.data;
    const missing =
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400);
    return (
      <section>
        <h1>
          {missing
            ? '스트리머를 찾을 수 없습니다'
            : '스트리머 정보를 불러오지 못했습니다'}
        </h1>
      </section>
    );
  }
  if (!loaded) return null;

  const isSelf =
    state.status === 'authenticated' && state.user.id === loaded.id;
  const live =
    broadcasts.status === 'loaded'
      ? broadcasts.data.filter((b) => b.status === 'LIVE')
      : [];
  const rest =
    broadcasts.status === 'loaded'
      ? broadcasts.data.filter((b) => b.status !== 'LIVE')
      : [];

  return (
    <section>
      <div className={styles.profile}>
        <span className={styles.avatar} aria-hidden="true">
          {loaded.nickname.slice(0, 1)}
        </span>
        <div className={styles.identity}>
          <h1 className={styles.nickname}>{loaded.nickname}</h1>
          <p className={styles.meta}>
            <span>팔로워 {loaded.followerCount.toLocaleString('ko-KR')}명</span>
            {loaded.liveBroadcastId && (
              <Link
                to={`/broadcasts/${loaded.liveBroadcastId}`}
                className={styles.liveLink}
              >
                LIVE 보러 가기
              </Link>
            )}
          </p>
        </div>
        {!isSelf && <FollowButton streamerId={loaded.id} />}
      </div>
      {broadcasts.status === 'failed' && (
        <p role="alert">방송을 불러오지 못했습니다.</p>
      )}
      {live.length > 0 && (
        <section className={styles.section} aria-labelledby="channel-live">
          <h2 id="channel-live" className={styles.sectionTitle}>
            지금 방송 중
          </h2>
          <BroadcastGrid broadcasts={live} showStreamer={false} />
        </section>
      )}
      {broadcasts.status === 'loaded' && (
        <section className={styles.section} aria-labelledby="channel-list">
          <h2 id="channel-list" className={styles.sectionTitle}>
            방송
          </h2>
          {rest.length === 0 ? (
            <p className={listStyles.empty}>
              {live.length > 0
                ? '지난 방송이 없습니다.'
                : '아직 공개된 방송이 없습니다.'}
            </p>
          ) : (
            <BroadcastGrid broadcasts={rest} showStreamer={false} />
          )}
        </section>
      )}
    </section>
  );
}
