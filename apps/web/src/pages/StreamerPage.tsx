import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import { BroadcastGrid } from '../components/BroadcastGrid';
import { UserAvatar } from '../components/UserAvatar';
import { FollowButton } from '../follows/FollowButton';
import { useFollows } from '../follows/follows-context';
import type { StreamerProfile } from '../streamers';
import { useApi, usePolledApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import listStyles from './ListPage.module.css';
import styles from './StreamerPage.module.css';

// 팔로우 패널과 같은 주기다.
const PROFILE_POLL_MS = 30_000;

// /channels/:id: 누구나 보는 스트리머 페이지. 닉네임을 눌러 들어온다
// (PRD-mypage 7.3). LIVE 방송을 먼저 보이고, 이어서 공개 목록에 나오는
// 그 스트리머의 나머지 방송을 보인다.
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

  // 방문자가 여기서 팔로우하거나 취소하면 팔로워 수가 바뀐다.
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
        <UserAvatar
          nickname={loaded.nickname}
          avatarUrl={loaded.avatarUrl}
          className={styles.avatar}
        />
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
      {loaded.bio && <p className={styles.bio}>{loaded.bio}</p>}
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
