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

// An anonymous visitor sees a few LIVE broadcasts in the same place.
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

function LivePanel() {
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
      <Link to="/login" state={returnHere(location)} className={styles.cta}>
        로그인하고 스트리머를 팔로우해 보세요
      </Link>
    </Panel>
  );
}

// Left of every page. Hidden below 1024px, where the header's 팔로잉 link
// opens the same list as a page.
export function FollowPanel() {
  const { state } = useAuth();
  if (state.status === 'loading') return <aside className={styles.panel} />;
  return state.status === 'authenticated' ? <FollowedPanel /> : <LivePanel />;
}
