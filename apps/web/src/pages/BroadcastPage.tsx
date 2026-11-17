import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api';
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
import { UserAvatar } from '../components/UserAvatar';
import { useDonationAlerts } from '../donation/donationAlerts';
import { useNewDonations } from '../donation/useNewDonations';
import { FollowButton } from '../follows/FollowButton';
import { useDisplayedBroadcast } from '../live-display';
import { partStarts, type Playhead } from '../replay-chat';
import { channelPath } from '../streamers';
import { usePolledApi, type Loadable } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import { useFinePointer, useWideScreen } from '../use-wide-screen';
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

// 방송이 사라지거나(404), ENDED가 되어 더 기다릴 것이 없을 때까지
// 방송을 다시 읽는다 (isWaitingForReplay 참고). 다른 이유로 다시 읽기에
// 실패하면 마지막 응답을 유지한다. 첫 조회가 404가 아닌 이유(네트워크,
// 5xx)로 실패해도 계속 다시 읽어, 재배포 중에 연 화면이 새로고침 없이
// 뜬다 (#149).
function useWatchedBroadcast(path: string): {
  broadcast: Loadable<Broadcast>;
  waitingForReplay: boolean;
  recheck: () => void;
} {
  const {
    data: broadcast,
    readAt,
    reload,
  } = usePolledApi<Broadcast>(path, STATUS_POLL_MS, {
    isTerminal: isGone,
    stopWhen: isSettled,
  });
  const waitingForReplay =
    broadcast.status === 'loaded' &&
    readAt !== null &&
    isWaitingForReplay(broadcast.data, readAt);
  // 종료 버튼·재생 오류는 다시 읽기가 끝나기를 기다리지 않는다.
  const recheck = useCallback(() => void reload(), [reload]);
  return { broadcast, waitingForReplay, recheck };
}

function isGone(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

// 방송이 지워졌거나, 끝났고 더 기다릴 다시보기도 없으면 그만 읽는다.
function isSettled(broadcast: Loadable<Broadcast>, readAt: number): boolean {
  if (broadcast.status === 'failed') return isGone(broadcast.error);
  return (
    broadcast.status === 'loaded' &&
    broadcast.data.status === 'ENDED' &&
    !isWaitingForReplay(broadcast.data, readAt)
  );
}

export function BroadcastPage() {
  const { id = '' } = useParams();
  const { state } = useAuth();
  const { broadcast, waitingForReplay, recheck } = useWatchedBroadcast(
    `/broadcasts/${encodeURIComponent(id)}`,
  );
  useDocumentTitle(broadcast.status === 'loaded' ? broadcast.data.title : null);

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

  const isOwner =
    state.status === 'authenticated' &&
    state.user.id === broadcast.data.streamer.id;
  return (
    <BroadcastView
      key={broadcast.data.id}
      b={broadcast.data}
      isOwner={isOwner}
      waitingForReplay={waitingForReplay}
      recheck={recheck}
    />
  );
}

// 읽어 온 방송을 그린다. 후원 목록 폴링은 방송을 읽은 뒤에만 시작해, 없는
// 방송(404)에는 후원을 읽지 않는다.
function BroadcastView({
  b,
  isOwner,
  waitingForReplay,
  recheck,
}: {
  b: Broadcast;
  isOwner: boolean;
  waitingForReplay: boolean;
  recheck: () => void;
}) {
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
  // 송출이 막 붙은 방송은 10초 동안 READY처럼 그린다(#249). 플레이어·배지·
  // 경과 시간·후원하기·새 후원 배너가 이 상태를 따르고, 소유자 버튼은 실제
  // 상태(`b`)를 쓴다. 지연이 끝나면 다음 5초 조회를 기다리지 않고 바뀐다.
  const shown = useDisplayedBroadcast(b);
  const wide = useWideScreen();
  const finePointer = useFinePointer();
  // 후원 패널과 플레이어 위 배너(S5)·읽어 주기(S14)가 같은 5초 폴링 응답을
  // 쓴다. 새 후원은 LIVE일 때만 배너로 띄운다. 처음 읽은 후원은 훅이
  // 기준선으로 거르고, 순서와 묶음은 송출 토스트와 같은 큐가 정한다(#164).
  const banners = useDonationAlerts();
  const donations = useNewDonations(b.id, (fresh) => {
    if (shown.status === 'LIVE') banners.enqueue(fresh);
  });

  const standbyImageUrl = shown.status === 'READY' ? b.standbyImageUrl : null;
  const playhead = heard?.broadcastId === b.id ? heard.playhead : null;
  const part = picked?.broadcastId === b.id ? picked.part : 0;
  // 녹화 파트가 같으면 같은 배열을 넘겨, 재생 위치만 바뀌는 렌더에서
  // 채팅 기록이 자리를 다시 계산하지 않게 한다.
  const starts = useMemo(
    () => partStarts(b.recordingParts),
    [b.recordingParts],
  );
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
      {shown.status === 'LIVE' && isOwner && (
        <p className={styles.playerNote}>
          내 방송이라 소리를 끄고 재생합니다. 송출하는 기기에서 소리를 켜면
          하울링이 생길 수 있습니다. 소리는 플레이어에서 켤 수 있습니다.
        </p>
      )}
    </>
  );
  const status = (
    <>
      <StatusBadge status={shown.status} />
      {shown.status === 'LIVE' && b.startedAt && (
        <ElapsedTime
          startedAt={b.startedAt}
          precision="second"
          className={styles.elapsed}
        />
      )}
    </>
  );
  const follow = !isOwner && <FollowButton streamerId={b.streamer.id} />;
  // 프로필 원 링크는 닉네임 링크와 같은 곳이라 탭 순서와 읽기 순서에서 뺀다.
  const streamer = (
    <p className={styles.streamer}>
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
      <Link to={channelPath(b.streamer.id)}>{b.streamer.nickname}</Link>
    </p>
  );
  const description = b.description && (
    <p className={styles.description}>{b.description}</p>
  );
  const owner = isOwner && <OwnerActions broadcast={b} onEnded={recheck} />;
  const donation = (
    <DonationPanel
      broadcast={shown}
      summary={donations.summary}
      reload={donations.reload}
      donateIn={
        wide ? (finePointer ? 'modal-with-payment' : 'modal') : 'inline'
      }
    />
  );

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
            className={`${styles.player} ${shown.status === 'READY' ? styles.waiting : ''}`}
          >
            {shown.status === 'LIVE' ? (
              <LivePlayer
                broadcastId={b.id}
                startMuted={isOwner}
                onPlaybackError={recheck}
                donationAlerts={banners}
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
                  {PLAYER_NOTICE[shown.status]}
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
        partStarts={starts}
        playhead={playhead}
      />
    </section>
  );
}
