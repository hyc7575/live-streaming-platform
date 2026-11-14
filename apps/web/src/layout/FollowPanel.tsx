import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import { FollowList } from '../follows/FollowList';
import {
  FOLLOWS_EMPTY,
  FOLLOWS_POLL_MS,
  followedEntries,
  liveEntries,
  returnHere,
} from '../follows/follows';
import { useFollows } from '../follows/follows-context';
import { usePolledApi } from '../use-api';
import styles from './FollowPanel.module.css';

// 비로그인 방문자는 같은 자리에서 LIVE 방송 몇 개를 본다.
const ANONYMOUS_LIVE_LIMIT = 5;

function Panel({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <aside className={styles.panel} aria-label={heading}>
      <h2 className={styles.heading}>{heading}</h2>
      {children}
    </aside>
  );
}

function FollowedPanel() {
  const { follows } = useFollows();
  return (
    <Panel heading="팔로우한 스트리머">
      {follows?.status === 'failed' && (
        <p className={styles.note}>목록을 불러오지 못했습니다.</p>
      )}
      {follows?.status === 'loaded' &&
        (follows.data.length === 0 ? (
          <p className={styles.note}>{FOLLOWS_EMPTY}</p>
        ) : (
          <FollowList entries={followedEntries(follows.data)} collapsible />
        ))}
    </Panel>
  );
}

// 세션 확인이 실패한 동안(`error`) `offerLogin`은 false다. 방문자가
// 이미 로그인했을 수 있고, 로그인해도 같은 실패를 겪는다.
function LivePanel({ offerLogin }: { offerLogin: boolean }) {
  const location = useLocation();
  const { data } = usePolledApi<Broadcast[]>(
    '/broadcasts?status=LIVE',
    FOLLOWS_POLL_MS,
  );
  return (
    <Panel heading="LIVE 중인 방송">
      {data.status === 'failed' && (
        <p className={styles.note}>목록을 불러오지 못했습니다.</p>
      )}
      {data.status === 'loaded' &&
        (data.data.length === 0 ? (
          <p className={styles.note}>LIVE 중인 방송이 없습니다.</p>
        ) : (
          <FollowList
            entries={liveEntries(data.data.slice(0, ANONYMOUS_LIVE_LIMIT))}
            collapsible
          />
        ))}
      {offerLogin && (
        <Link to="/login" state={returnHere(location)} className={styles.cta}>
          로그인하고 스트리머를 팔로우해 보세요
        </Link>
      )}
    </Panel>
  );
}

// 모든 페이지의 왼쪽. 1024px 아래에서는 숨기고, 헤더의 팔로잉 링크가
// 같은 목록을 페이지로 연다.
export function FollowPanel() {
  const { state } = useAuth();
  if (state.status === 'loading') return <aside className={styles.panel} />;
  if (state.status === 'authenticated') return <FollowedPanel />;
  return <LivePanel offerLogin={state.status === 'anonymous'} />;
}
