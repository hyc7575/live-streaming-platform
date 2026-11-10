import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import type { BroadcastStatus } from '../components/StatusBadge';
import { CommentPanel } from '../components/CommentPanel';
import { DonationPanel } from '../components/DonationPanel';
import { ElapsedTime } from '../components/ElapsedTime';
import { LivePlayer } from '../components/LivePlayer';
import { OwnerActions } from '../components/OwnerActions';
import { ReplayPlayer } from '../components/ReplayPlayer';
import { StatusBadge } from '../components/StatusBadge';
import { FollowButton } from '../follows/FollowButton';
import type { Loadable } from '../use-api';
import styles from './BroadcastPage.module.css';

const PLAYER_NOTICE: Record<Exclude<BroadcastStatus, 'LIVE'>, string> = {
  READY: '방송 전입니다. 스트리머가 방송을 시작하면 자동으로 재생합니다.',
  ENDED: '방송이 끝났습니다.',
};

// A viewer who was watching when the broadcast ended still reads that it
// ended (T9), even when the recording is already up in the player's place.
const REPLAY_NOTICE = '방송이 끝났습니다. 녹화된 방송을 다시 볼 수 있습니다.';

// PRD §7.4 T9: viewers notice an ended broadcast within 10 s, so the status
// is polled at half that.
const STATUS_POLL_MS = 5000;

// The API's recording reconciler fills recordingFiles some time after the
// broadcast ends: it runs every 30 s, and OME first has to close the file.
// Until this long after endedAt an ENDED broadcast with no files may still
// get a replay, so the page keeps polling; after it, there is none.
const REPLAY_WAIT_MS = 90_000;

const REPLAY_PREPARING_NOTICE = '다시보기를 준비하는 중입니다.';

// True while an ENDED broadcast has no recording yet but may still get one.
// `readAt` is when this answer arrived, so the check stays pure in render.
function isWaitingForReplay(b: Broadcast, readAt: number): boolean {
  if (b.status !== 'ENDED' || b.recordingFiles.length > 0) return false;
  if (b.endedAt === null) return false;
  return readAt - Date.parse(b.endedAt) < REPLAY_WAIT_MS;
}

// Keeps re-reading the broadcast until it is gone, or ENDED with nothing
// more to wait for (see isWaitingForReplay). A re-read that fails for
// another reason keeps the last answer.
function useWatchedBroadcast(path: string): {
  broadcast: Loadable<Broadcast>;
  waitingForReplay: boolean;
  recheck: () => void;
} {
  const [result, setResult] = useState<{
    path: string;
    loadable: Loadable<Broadcast>;
    readAt: number;
  } | null>(null);
  const recheckRef = useRef<() => void>(() => {});
  const current = result?.path === path ? result : null;
  const broadcast: Loadable<Broadcast> = current
    ? current.loadable
    : { status: 'loading' };
  const waitingForReplay =
    current?.loadable.status === 'loaded' &&
    isWaitingForReplay(current.loadable.data, current.readAt);
  const settled =
    broadcast.status === 'failed' ||
    (broadcast.status === 'loaded' &&
      broadcast.data.status === 'ENDED' &&
      !waitingForReplay);

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
              setResult({
                path,
                loadable: { status: 'loaded', data },
                readAt: Date.now(),
              });
          },
          (error: unknown) => {
            if (cancelled) return;
            const gone = error instanceof ApiError && error.status === 404;
            setResult((prev) =>
              !gone && prev?.path === path && prev.loadable.status === 'loaded'
                ? prev
                : {
                    path,
                    loadable: { status: 'failed', error },
                    readAt: Date.now(),
                  },
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
  return { broadcast, waitingForReplay, recheck };
}

export function BroadcastPage() {
  const { id = '' } = useParams();
  const { state } = useAuth();
  const { broadcast, waitingForReplay, recheck } = useWatchedBroadcast(
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
  const standbyImageUrl = b.status === 'READY' ? b.standbyImageUrl : null;
  return (
    <section className={styles.page}>
      <div className={styles.main}>
        {b.status === 'ENDED' && b.recordingFiles.length > 0 ? (
          <ReplayPlayer files={b.recordingFiles} />
        ) : (
          <div
            className={`${styles.player} ${b.status === 'READY' ? styles.waiting : ''}`}
          >
            {b.status === 'LIVE' ? (
              <LivePlayer
                broadcastId={b.id}
                startMuted={isOwner}
                onPlaybackError={recheck}
              />
            ) : (
              <>
                {standbyImageUrl && (
                  <img
                    className={styles.standby}
                    src={standbyImageUrl}
                    alt=""
                  />
                )}
                <p
                  className={`${styles.notice} ${standbyImageUrl ? styles.onStandby : ''}`}
                >
                  {PLAYER_NOTICE[b.status]}
                </p>
                {waitingForReplay && (
                  <p className={styles.preparing} role="status">
                    {REPLAY_PREPARING_NOTICE}
                  </p>
                )}
              </>
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
          <div className={styles.status}>
            <StatusBadge status={b.status} />
            {b.status === 'LIVE' && b.startedAt && (
              <ElapsedTime
                startedAt={b.startedAt}
                precision="second"
                className={styles.elapsed}
              />
            )}
          </div>
          <h1 className={styles.title}>{b.title}</h1>
          <div className={styles.streamerRow}>
            <p className={styles.streamer}>{b.streamer.nickname}</p>
            {!isOwner && <FollowButton streamerId={b.streamer.id} />}
          </div>
          {b.description && (
            <p className={styles.description}>{b.description}</p>
          )}
          {isOwner && <OwnerActions broadcast={b} onEnded={recheck} />}
        </div>
        <DonationPanel broadcast={b} />
      </div>
      <CommentPanel broadcastId={b.id} status={b.status} />
    </section>
  );
}
