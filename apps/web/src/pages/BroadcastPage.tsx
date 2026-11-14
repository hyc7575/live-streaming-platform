import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import { ActionSheet } from '../components/ActionSheet';
import { BroadcastSidePanel } from '../components/BroadcastSidePanel';
import { CategoryBadge } from '../components/CategoryBadge';
import type { BroadcastStatus } from '../components/StatusBadge';
import { DonationPanel } from '../components/DonationPanel';
import { ElapsedTime } from '../components/ElapsedTime';
import { LivePlayer } from '../components/LivePlayer';
import { OwnerActions } from '../components/OwnerActions';
import { ReplayParts, ReplayPlayer } from '../components/ReplayPlayer';
import { StatusBadge } from '../components/StatusBadge';
import { FollowButton } from '../follows/FollowButton';
import { partStarts, type Playhead } from '../replay-chat';
import { channelPath } from '../streamers';
import type { Loadable } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import { useWideScreen } from '../use-wide-screen';
import styles from './BroadcastPage.module.css';

const PLAYER_NOTICE: Record<Exclude<BroadcastStatus, 'LIVE'>, string> = {
  READY: '방송 준비 중입니다.',
  ENDED: '방송이 끝났습니다.',
};

// 방송이 끝날 때 보고 있던 시청자는, 플레이어 자리에 녹화가 이미 올라와
// 있어도 방송이 끝났다는 안내를 읽는다 (T9).
const REPLAY_NOTICE = '방송이 끝났습니다. 녹화된 방송을 다시 볼 수 있습니다.';

// PRD §7.4 T9: 시청자는 10초 안에 방송 종료를 알아야 하므로, 상태를
// 그 절반 간격으로 폴링한다.
const STATUS_POLL_MS = 5000;

// API의 녹화 reconciler는 방송이 끝나고 얼마 뒤에 recordingFiles를 채운다.
// 30초마다 돌고, 그 전에 OME가 파일을 닫아야 한다.
// endedAt에서 이만큼 지나기 전에는 파일 없는 ENDED 방송에도 다시보기가
// 생길 수 있어 페이지가 계속 폴링한다. 그 뒤로는 다시보기가 없다.
const REPLAY_WAIT_MS = 90_000;

const REPLAY_PREPARING_NOTICE = '다시보기를 준비하는 중입니다.';

// ENDED 방송에 아직 녹화가 없지만 생길 수 있는 동안 true다.
// `readAt`은 이 응답이 도착한 시각이라, 렌더 안에서도 검사가 순수하다.
function isWaitingForReplay(b: Broadcast, readAt: number): boolean {
  if (b.status !== 'ENDED' || b.recordingFiles.length > 0) return false;
  if (b.endedAt === null) return false;
  return readAt - Date.parse(b.endedAt) < REPLAY_WAIT_MS;
}

// 방송이 사라지거나, ENDED가 되어 더 기다릴 것이 없을 때까지
// 방송을 다시 읽는다 (isWaitingForReplay 참고). 다른 이유로 다시 읽기에
// 실패하면 마지막 응답을 유지한다.
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
  useDocumentTitle(broadcast.status === 'loaded' ? broadcast.data.title : null);
  // 재생 위치를 받은 방송을 함께 적어 둔다. 그래서 다른 방송으로 옮기면
  // 그 방송의 채팅 기록은 재생 위치 없이 시작한다.
  const [heard, setHeard] = useState<{
    broadcastId: string;
    playhead: Playhead;
  } | null>(null);
  const [picked, setPicked] = useState<{
    broadcastId: string;
    part: number;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const wide = useWideScreen();

  // 소유자인지 알기 전까지 플레이어는 음소거로 시작할지
  // 정할 수 없다 (T7).
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
  const playhead = heard?.broadcastId === b.id ? heard.playhead : null;
  const part = picked?.broadcastId === b.id ? picked.part : 0;
  const hasReplay = b.status === 'ENDED' && b.recordingFiles.length > 0;
  const pickPart = (p: number) => {
    setPicked({ broadcastId: b.id, part: p });
    setSheetOpen(false);
  };

  // 아래 조각은 한 번만 그린다. 넓은 화면에서는 플레이어 주변에, 좁은
  // 화면에서는 채팅이 자리를 차지하므로 더 보기 시트 안에 그린다.
  const parts = hasReplay && (
    <ReplayParts files={b.recordingFiles} part={part} onPart={pickPart} />
  );
  const notes = (
    <>
      {hasReplay && <p className={styles.playerNote}>{REPLAY_NOTICE}</p>}
      {b.status === 'LIVE' && isOwner && (
        <p className={styles.playerNote}>
          내 방송이라 소리를 끄고 재생합니다. 송출하는 기기에서 소리를 켜면
          하울링이 생길 수 있습니다. 소리는 플레이어에서 켤 수 있습니다.
        </p>
      )}
    </>
  );
  const status = (
    <>
      <StatusBadge status={b.status} />
      {b.status === 'LIVE' && b.startedAt && (
        <ElapsedTime
          startedAt={b.startedAt}
          precision="second"
          className={styles.elapsed}
        />
      )}
    </>
  );
  const follow = !isOwner && <FollowButton streamerId={b.streamer.id} />;
  const streamer = (
    <p className={styles.streamer}>
      <Link to={channelPath(b.streamer.id)}>{b.streamer.nickname}</Link>
    </p>
  );
  const description = b.description && (
    <p className={styles.description}>{b.description}</p>
  );
  const owner = isOwner && <OwnerActions broadcast={b} onEnded={recheck} />;
  const donation = <DonationPanel broadcast={b} />;

  return (
    <section className={styles.page}>
      <div className={styles.main}>
        {hasReplay ? (
          <ReplayPlayer
            key={b.id}
            files={b.recordingFiles}
            part={part}
            onPart={(p) => setPicked({ broadcastId: b.id, part: p })}
            onPlayhead={(p) => setHeard({ broadcastId: b.id, playhead: p })}
          />
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
        {wide ? (
          <>
            {parts}
            {notes}
            <div className={styles.info}>
              <div className={styles.status}>{status}</div>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{b.title}</h1>
                <CategoryBadge category={b.category} game={b.game} />
              </div>
              <div className={styles.streamerRow}>
                {streamer}
                {follow}
              </div>
              {description}
              {owner}
            </div>
            {donation}
          </>
        ) : (
          <div className={styles.summary}>
            <h1 className={styles.summaryTitle}>{b.title}</h1>
            {status}
            {follow}
            <ActionSheet
              label="더 보기"
              title={b.title}
              // 360px 요약 줄은 제목 자리가 모자라 배지는 시트의 전체 제목 옆에만 단다.
              titleAside={<CategoryBadge category={b.category} game={b.game} />}
              open={sheetOpen}
              onOpenChange={setSheetOpen}
            >
              {streamer}
              {description}
              {donation}
              {parts}
              {owner}
              {notes}
            </ActionSheet>
          </div>
        )}
      </div>
      <BroadcastSidePanel
        key={b.id}
        broadcastId={b.id}
        status={b.status}
        partStarts={partStarts(b.recordingParts)}
        playhead={playhead}
      />
    </section>
  );
}
