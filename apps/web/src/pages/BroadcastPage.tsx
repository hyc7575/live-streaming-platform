import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import type { BroadcastStatus } from '../components/StatusBadge';
import { CommentPanel } from '../components/CommentPanel';
import { LivePlayer } from '../components/LivePlayer';
import { OwnerActions } from '../components/OwnerActions';
import { ReplayPlayer } from '../components/ReplayPlayer';
import { StatusBadge } from '../components/StatusBadge';
import type { Loadable } from '../use-api';
import styles from './BroadcastPage.module.css';

const PLAYER_NOTICE: Record<Exclude<BroadcastStatus, 'LIVE'>, string> = {
  READY: '아직 시작하지 않은 방송입니다.',
  ENDED: '방송이 끝났습니다.',
};

// A viewer who was watching when the broadcast ended still reads that it
// ended (T9), even when the recording is already up in the player's place.
const REPLAY_NOTICE = '방송이 끝났습니다. 녹화된 방송을 다시 볼 수 있습니다.';

// PRD §7.4 T9: viewers notice an ended broadcast within 10 s, so the status
// is polled at half that.
const STATUS_POLL_MS = 5000;

// Keeps re-reading the broadcast until it is ENDED or gone. A re-read that
// fails for another reason keeps the last answer.
function useWatchedBroadcast(path: string): {
  broadcast: Loadable<Broadcast>;
  recheck: () => void;
} {
  const [result, setResult] = useState<{
    path: string;
    loadable: Loadable<Broadcast>;
  } | null>(null);
  const recheckRef = useRef<() => void>(() => {});
  const broadcast: Loadable<Broadcast> =
    result?.path === path ? result.loadable : { status: 'loading' };
  const settled =
    broadcast.status === 'failed' ||
    (broadcast.status === 'loaded' && broadcast.data.status === 'ENDED');

  useEffect(() => {
    if (settled) return;
    let cancelled = false;
    let inFlight = false;
    const load = () => {
      if (inFlight) return;
      inFlight = true;
      apiFetch<Broadcast>(path)
        .then(
          (data) => {
            if (!cancelled)
              setResult({ path, loadable: { status: 'loaded', data } });
          },
          (error: unknown) => {
            if (cancelled) return;
            const gone = error instanceof ApiError && error.status === 404;
            setResult((prev) =>
              !gone && prev?.path === path && prev.loadable.status === 'loaded'
                ? prev
                : { path, loadable: { status: 'failed', error } },
            );
          },
        )
        .finally(() => {
          inFlight = false;
        });
    };
    load();
    const timer = setInterval(load, STATUS_POLL_MS);
    recheckRef.current = load;
    return () => {
      cancelled = true;
      clearInterval(timer);
      recheckRef.current = () => {};
    };
  }, [path, settled]);

  const recheck = useCallback(() => recheckRef.current(), []);
  return { broadcast, recheck };
}

export function BroadcastPage() {
  const { id = '' } = useParams();
  const { state } = useAuth();
  const { broadcast, recheck } = useWatchedBroadcast(
    `/broadcasts/${encodeURIComponent(id)}`,
  );

  // Until we know whether this is the owner, the player cannot know whether
  // to start muted (T7).
  if (broadcast.status === 'loading' || state.status === 'loading') return null;
  if (broadcast.status === 'failed') {
    const notFound =
      broadcast.error instanceof ApiError && broadcast.error.status === 404;
    return (
      <section>
        <h1>
          {notFound ? '방송을 찾을 수 없습니다' : '방송을 불러오지 못했습니다'}
        </h1>
      </section>
    );
  }

  const b = broadcast.data;
  const isOwner =
    state.status === 'authenticated' && state.user.id === b.streamer.id;
  return (
    <section className={styles.page}>
      <div className={styles.main}>
        {b.status === 'ENDED' && b.recordingFiles.length > 0 ? (
          <ReplayPlayer files={b.recordingFiles} />
        ) : (
          <div className={styles.player}>
            {b.status === 'LIVE' ? (
              <LivePlayer
                broadcastId={b.id}
                startMuted={isOwner}
                onPlaybackError={recheck}
              />
            ) : (
              <p className={styles.notice}>{PLAYER_NOTICE[b.status]}</p>
            )}
          </div>
        )}
        {b.status === 'ENDED' && b.recordingFiles.length > 0 && (
          <p className={styles.playerNote}>{REPLAY_NOTICE}</p>
        )}
        {b.status === 'LIVE' && isOwner && (
          <p className={styles.playerNote}>
            내 방송이라 소리를 끄고 재생합니다. 송출하는 기기에서 소리를 켜면
            하울링이 생길 수 있습니다. 소리는 플레이어에서 켤 수 있습니다.
          </p>
        )}
        <div className={styles.info}>
          <StatusBadge status={b.status} />
          <h1 className={styles.title}>{b.title}</h1>
          <p className={styles.streamer}>{b.streamer.nickname}</p>
          {b.description && (
            <p className={styles.description}>{b.description}</p>
          )}
          {isOwner && <OwnerActions broadcast={b} onEnded={recheck} />}
        </div>
      </div>
      <CommentPanel broadcastId={b.id} />
    </section>
  );
}
