import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Link,
  useBlocker,
  useParams,
  type Blocker,
  type BlockerFunction,
} from 'react-router';
import { ApiError } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import type {
  CameraCapture,
  CameraCaptureState,
  WakeLockStatus,
} from '../capture/cameraCapture';
import type { PcCapture } from '../capture/pcCapture';
import { currentScreenAudioSupport } from '../capture/screenAudioSupport';
import { BrowserNotice, PcPreflight } from '../components/PcPreflight';
import { PermissionGuide } from '../components/PermissionGuide';
import { useThumbnailCapture } from '../publish/thumbnailCapture';
import {
  usePublishSession,
  type PublishSessionState,
} from '../publish/usePublishSession';
import { useApi, usePolledApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import {
  CAPTURE_SOURCES,
  endNotice,
  offeredSources,
  type ActiveCapture,
  type CaptureEndReason,
  type CaptureSlot,
  type CaptureSource,
} from './captureSources';
import { OBS_STOP_REMINDER, ObsPanel } from './ObsPanel';
import styles from './PublishPage.module.css';

export function PublishPage() {
  const { id = '' } = useParams();
  const { state } = useAuth();
  const broadcast = useApi<Broadcast>(`/broadcasts/${encodeURIComponent(id)}`);
  useDocumentTitle(
    broadcast.status === 'loaded' ? `[송출] ${broadcast.data.title}` : null,
  );

  if (broadcast.status === 'loading') return null;
  if (broadcast.status === 'failed') {
    const notFound =
      broadcast.error instanceof ApiError && broadcast.error.status === 404;
    return (
      <section className={styles.page}>
        <h1>
          {notFound ? '방송을 찾을 수 없습니다' : '방송을 불러오지 못했습니다'}
        </h1>
      </section>
    );
  }
  const b = broadcast.data;
  // 여기서는 RequireAuth가 사용자를 보장한다. 소유권은 API가 다시 확인한다.
  if (state.status !== 'authenticated' || state.user.id !== b.streamer.id) {
    return (
      <section className={styles.page}>
        <h1>권한이 없습니다</h1>
        <p className={styles.note}>
          방송을 만든 스트리머만 송출할 수 있습니다.
        </p>
      </section>
    );
  }
  if (b.status === 'ENDED') {
    return (
      <section className={styles.page}>
        <Heading broadcast={b} />
        <div className={styles.ended}>
          <p className={styles.endedText}>
            종료된 방송입니다. 새 방송을 만드세요.
          </p>
          <div className={styles.actions}>
            <Link to="/studio/new" className={styles.primary}>
              방송 만들기
            </Link>
            <Link to="/studio" className={styles.secondary}>
              내 방송
            </Link>
          </div>
        </div>
      </section>
    );
  }
  return <PublishStudio broadcast={b} />;
}

function Heading({ broadcast }: { broadcast: Broadcast }) {
  return (
    <div className={styles.heading}>
      <h1 className={styles.title}>{broadcast.title}</h1>
      <Link to={`/broadcasts/${broadcast.id}`} target="_blank">
        시청 화면 열기
      </Link>
    </div>
  );
}

// 시청 페이지와 같은 주기다. OBS나 다른 탭이 방송을 시작하거나 끊거나 끝낼 수
// 있고, 그건 서버만 안다.
const POLL_MS = 5000;

type EndedBy = 'me' | 'elsewhere';

function endedBy(
  session: PublishSessionState,
  status: Broadcast['status'],
): EndedBy | null {
  if (session.kind === 'ended') return session.elsewhere ? 'elsewhere' : 'me';
  if (session.kind === 'idle' && status === 'ENDED') return 'elsewhere';
  return null;
}

function PublishStudio({ broadcast: opened }: { broadcast: Broadcast }) {
  const session = usePublishSession(opened.id);
  const polled = usePolledApi<Broadcast>(
    `/broadcasts/${encodeURIComponent(opened.id)}`,
    POLL_MS,
  );
  const broadcast = polled.data.status === 'loaded' ? polled.data.data : opened;
  const { reload } = polled;
  // 이게 없으면 방금 끊긴 이 페이지의 송출이 다음 폴링까지
  // 다른 쪽 송출로 읽힌다.
  useEffect(() => {
    reload();
  }, [session.state.kind, reload]);
  const [slot, setSlot] = useState<CaptureSlot>({ kind: 'off', notice: null });
  const [support] = useState(currentScreenAudioSupport);
  const sources = offeredSources(support);
  const videoRef = useRef<HTMLVideoElement>(null);
  useThumbnailCapture(broadcast.id, videoRef, session.state.kind === 'live');
  // 페이지가 사라진 뒤에 resolve된 캡처도 멈춰야 한다. 그러지 않으면
  // 브라우저가 화면이나 카메라를 쓰는 중이라고 계속 표시한다.
  const alive = useRef(false);
  const ended = endedBy(session.state, broadcast.status);
  // 송출이 끊겨도 서버는 방송을 LIVE로 유지하고, OBS나 LIVE 방송에서 연
  // 페이지는 이 페이지 없이 송출한다. 어느 쪽이든
  // 스트리머에게는 방송을 끝낼 방법이 필요하다.
  const [onAir, setOnAir] = useState(broadcast.status === 'LIVE');
  if ((session.state.kind === 'live' || broadcast.status === 'LIVE') && !onAir)
    setOnAir(true);
  // 방송 하나는 송출 하나만 받는다. 송출이 끊긴 LIVE 방송
  // (disconnectedAt)은 유예 시간 중이고, 이 페이지가 그 자리를 채울 수 있다.
  const publishingElsewhere =
    broadcast.status === 'LIVE' &&
    broadcast.disconnectedAt === null &&
    session.state.kind === 'idle';
  // OBS는 방송이 끝난 뒤에도 재연결을 계속한다(#88). 그래서 OBS를 썼을 수
  // 있으면 종료 화면이 스트리머에게 OBS를 멈추라고 알린다. 여기서 URL을
  // 발급했거나, 이 페이지가 하지 않은 송출이 있었던 경우다.
  const [obsMayPublish, setObsMayPublish] = useState(false);
  if (publishingElsewhere && !obsMayPublish) setObsMayPublish(true);
  // 방송이 끝나면 캡처는 더 쓸 데가 없다. 여기서 버리면
  // 아래 effect가 트랙을 멈춘다.
  const active: ActiveCapture | null =
    slot.kind === 'on' && ended === null ? slot : null;
  const capture = active?.capture ?? null;
  const camera = useCameraState(
    active?.source === 'camera' ? active.capture : null,
  );
  const cameraSwitching = camera?.status === 'live' && camera.switching;
  const leave = useLeaveGuard(
    session.state.kind === 'connecting' || session.state.kind === 'live',
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const onCaptureEnded = useEffectEvent(
    (which: ActiveCapture['capture'], reason: CaptureEndReason) => {
      const live = session.state.kind === 'live';
      const notice = endNotice(reason, live);
      setSlot((s) =>
        s.kind === 'on' && s.capture === which ? { kind: 'off', notice } : s,
      );
      if (live) {
        session.end();
      } else if (
        session.state.kind === 'requesting' ||
        session.state.kind === 'connecting' ||
        session.state.kind === 'idle'
      ) {
        session.cancel();
      }
    },
  );

  useEffect(() => {
    if (!capture) return;
    if (videoRef.current) videoRef.current.srcObject = capture.stream;
    const check = () => {
      const captureState = capture.getState();
      if (captureState.status === 'ended') {
        onCaptureEnded(capture, captureState.reason);
      }
    };
    const unsubscribe = capture.subscribe(check);
    // 캡처를 보여 준 렌더와 이 effect 사이에 캡처가 끝날 수 있고,
    // 그 변화는 아무도 듣기 전에 알려졌다.
    check();
    return () => {
      unsubscribe();
      capture.stop();
    };
  }, [capture]);

  async function turnOn(source: CaptureSource) {
    const spec = CAPTURE_SOURCES[source];
    setSlot({ kind: 'acquiring', source });
    let next: ActiveCapture;
    try {
      next = await spec.start();
    } catch (error) {
      if (alive.current) {
        setSlot({
          kind: 'failed',
          message: spec.failureMessage(error),
          permissionGuide: spec.isPermissionDenied(error),
        });
      }
      return;
    }
    if (!alive.current) {
      next.capture.stop();
      return;
    }
    setSlot({ kind: 'on', ...next });
  }

  function startPublish(next: ActiveCapture) {
    // T7: 믹서의 AudioContext는 클릭 안에서만 resume할 수 있다. 그러지 않으면
    // 소리 없이 송출된다.
    if (next.source === 'screen') void next.capture.resumeAudio();
    session.start(next.capture.stream);
  }

  if (ended !== null) {
    const notice = slot.kind === 'off' ? slot.notice : null;
    return (
      <section className={styles.page}>
        <Heading broadcast={broadcast} />
        <div className={styles.ended}>
          <p role="status" className={styles.endedText}>
            {ended === 'elsewhere'
              ? '방송이 종료되었습니다.'
              : '방송을 종료했습니다.'}
          </p>
          {notice && <p className={styles.note}>{notice}</p>}
          {obsMayPublish && <p className={styles.note}>{OBS_STOP_REMINDER}</p>}
          <div className={styles.actions}>
            <Link to={`/broadcasts/${broadcast.id}`} className={styles.primary}>
              시청 화면 보기
            </Link>
            <Link to="/studio" className={styles.secondary}>
              내 방송
            </Link>
          </div>
        </div>
        <LeaveConfirm blocker={leave} />
      </section>
    );
  }

  const publishing =
    session.state.kind === 'live' ||
    session.state.kind === 'ending' ||
    session.state.kind === 'end-failed';
  const offer = CAPTURE_SOURCES[sources[0]].offer;
  const desktop = sources.includes('screen');
  const endControl =
    session.state.kind === 'end-failed' ? (
      <button type="button" className={styles.danger} onClick={session.end}>
        다시 종료하기
      </button>
    ) : session.state.kind === 'live' ||
      (session.state.kind === 'idle' && onAir) ? (
      <EndControl onEnd={session.end} />
    ) : null;

  return (
    <section className={styles.page}>
      <Heading broadcast={broadcast} />
      <div className={styles.studio}>
        {capture ? (
          <video
            ref={videoRef}
            className={styles.preview}
            data-source={active?.source}
            data-mirrored={
              camera?.status === 'live' && camera.facing === 'user'
            }
            aria-label="미리보기"
            autoPlay
            muted
            playsInline
          />
        ) : (
          <div className={styles.placeholder}>
            <p className={styles.note}>
              {publishingElsewhere
                ? 'OBS나 다른 탭에서 송출 중이라 여기에는 미리보기가 없습니다. 화면은 시청 화면에서 확인하세요.'
                : offer.placeholder}
            </p>
          </div>
        )}
        <PublishTabs
          browser={
            <>
              {desktop && (!active || active.source === 'screen') && (
                <BrowserNotice support={support} />
              )}
              <StatusLine
                slot={slot}
                session={session.state}
                onAir={onAir}
                onAirWithoutCapture={offer.onAirWithoutCapture}
                publishingElsewhere={publishingElsewhere}
              />
              {active && (
                <SourcePanel
                  active={active}
                  cameraState={camera}
                  onReplaceTrack={session.replaceTrack}
                  onRestart={
                    session.state.kind === 'idle'
                      ? () => {
                          active.capture.stop();
                          void turnOn(active.source);
                        }
                      : undefined
                  }
                />
              )}
              <div className={`${styles.actions} ${styles.mainActions}`}>
                {active?.source === 'camera' &&
                  camera?.status === 'live' &&
                  camera.canSwitchCamera && (
                    <CameraSwitch
                      capture={active.capture}
                      state={camera}
                      // 송출을 만드는 도중에 전환하면 송출에
                      // 바꿔 끼울 카메라 트랙이 없을 수 있다.
                      allowed={
                        session.state.kind === 'idle' ||
                        session.state.kind === 'live'
                      }
                      onReleaseTrack={session.releaseTrack}
                      onReplaceTrack={session.replaceTrack}
                    />
                  )}
                {!active &&
                  session.state.kind === 'idle' &&
                  sources.map((source, index) => (
                    <button
                      key={source}
                      type="button"
                      className={
                        index === 0 ? styles.primary : styles.secondary
                      }
                      disabled={slot.kind === 'acquiring'}
                      onClick={() => void turnOn(source)}
                    >
                      {CAPTURE_SOURCES[source].startLabel}
                    </button>
                  ))}
                {active && !publishing && (
                  <>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={
                        session.state.kind !== 'idle' ||
                        cameraSwitching ||
                        publishingElsewhere
                      }
                      onClick={() => startPublish(active)}
                    >
                      {session.state.kind === 'idle' && session.state.retry
                        ? '다시 시도'
                        : '방송 시작'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => active.capture.stop()}
                    >
                      {CAPTURE_SOURCES[active.source].stopLabel}
                    </button>
                  </>
                )}
                {endControl}
              </div>
            </>
          }
          obs={
            <ObsPanel
              broadcast={broadcast}
              endControl={endControl}
              onIssued={() => setObsMayPublish(true)}
            />
          }
        />
      </div>
      <LeaveConfirm blocker={leave} />
    </section>
  );
}

const PUBLISH_TABS = [
  { key: 'browser', label: '브라우저로 송출' },
  { key: 'obs', label: 'OBS로 송출' },
] as const;

type PublishTab = (typeof PUBLISH_TABS)[number]['key'];

// BroadcastSidePanel처럼 자동 활성화하는 WAI-ARIA 탭이다. 두 패널 모두
// 마운트된 채로 두어, 탭을 바꿔도 발급한 OBS URL과 브라우저 조작이
// 남는다.
function PublishTabs({ browser, obs }: { browser: ReactNode; obs: ReactNode }) {
  const [selected, setSelected] = useState<PublishTab>('browser');
  const panels: Record<PublishTab, ReactNode> = { browser, obs };

  function onKeyDown(e: KeyboardEvent) {
    const index = PUBLISH_TABS.findIndex((t) => t.key === selected);
    const next = {
      ArrowRight: (index + 1) % PUBLISH_TABS.length,
      ArrowLeft: (index - 1 + PUBLISH_TABS.length) % PUBLISH_TABS.length,
      Home: 0,
      End: PUBLISH_TABS.length - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const tab = PUBLISH_TABS[next].key;
    setSelected(tab);
    document.getElementById(publishTabId(tab))?.focus();
  }

  return (
    <div className={styles.side}>
      <div
        role="tablist"
        aria-label="송출 방법"
        className={styles.tabs}
        onKeyDown={onKeyDown}
      >
        {PUBLISH_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={publishTabId(t.key)}
            aria-selected={selected === t.key}
            aria-controls={publishPanelId(t.key)}
            tabIndex={selected === t.key ? 0 : -1}
            className={styles.tab}
            onClick={() => setSelected(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {PUBLISH_TABS.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={publishPanelId(t.key)}
          aria-labelledby={publishTabId(t.key)}
          hidden={selected !== t.key}
          className={styles.tabPanel}
        >
          {panels[t.key]}
        </div>
      ))}
    </div>
  );
}

const publishTabId = (tab: PublishTab) => `publish-tab-${tab}`;
const publishPanelId = (tab: PublishTab) => `publish-panel-${tab}`;

/**
 * `onAir`인 동안 스트리머가 떠나기 전에 묻는다. 이 페이지가 언마운트되면
 * 송출이 끊기고, 서버는 유예 시간이 지나면 방송을 끝낸다.
 * 새로고침이나 탭 닫기에는 브라우저 자체 확인 창이 뜬다. 앱 안의 이동
 * (헤더 링크, 뒤로 가기)은 {@link LeaveConfirm}을 위해 붙잡아 둔다.
 */
function useLeaveGuard(onAir: boolean): Blocker {
  useEffect(() => {
    if (!onAir) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [onAir]);
  // useBlocker는 바뀐 함수를 passive effect에서만 라우터에 넘긴다.
  // 그 effect는 페이지가 송출 중이라고 보인 뒤 한 프레임 늦게
  // 돌 수 있다. commit 때 설정하는 ref가 그 틈을 메운다.
  const blocking = useRef(onAir);
  useLayoutEffect(() => {
    blocking.current = onAir;
  }, [onAir]);
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      blocking.current && currentLocation.pathname !== nextLocation.pathname,
    [],
  );
  return useBlocker(shouldBlock);
}

function LeaveConfirm({ blocker }: { blocker: Blocker }) {
  const stay = useRef<HTMLButtonElement>(null);
  const blocked = blocker.state === 'blocked';
  useEffect(() => {
    if (blocked) stay.current?.focus();
  }, [blocked]);
  if (blocker.state !== 'blocked') return null;
  return (
    <div className={styles.backdrop}>
      <div
        className={styles.leaveDialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-confirm-text"
        onKeyDown={(event) => {
          if (event.key === 'Escape') blocker.reset();
        }}
      >
        <p id="leave-confirm-text" className={styles.confirmText}>
          송출 중입니다. 이 화면을 떠나면 방송이 끊깁니다.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.danger}
            onClick={() => blocker.proceed()}
          >
            떠나기
          </button>
          <button
            ref={stay}
            type="button"
            className={styles.secondary}
            onClick={() => blocker.reset()}
          >
            머무르기
          </button>
        </div>
      </div>
    </div>
  );
}

const noSubscribe = () => () => {};
const noCamera = () => null;

function useCameraState(
  camera: CameraCapture | null,
): CameraCaptureState | null {
  return useSyncExternalStore(
    camera?.subscribe ?? noSubscribe,
    camera?.getState ?? noCamera,
  );
}

/** 캡처 소스 한 가지에만 있는 조작. */
function SourcePanel({
  active,
  cameraState,
  onReplaceTrack,
  onRestart,
}: {
  active: ActiveCapture;
  cameraState: CameraCaptureState | null;
  onReplaceTrack: (track: MediaStreamTrack) => void;
  onRestart?: () => void;
}) {
  switch (active.source) {
    case 'screen':
      return (
        <ScreenControls
          capture={active.capture}
          onReplaceTrack={onReplaceTrack}
          onRestart={onRestart}
        />
      );
    case 'camera':
      return cameraState?.status === 'live' ? (
        <p className={styles.note}>
          {cameraState.facing === 'user' ? '전면 카메라' : '후면 카메라'} ·{' '}
          {WAKE_LOCK_MESSAGES[cameraState.wakeLock]}
        </p>
      ) : null;
  }
}

const WAKE_LOCK_MESSAGES: Record<WakeLockStatus, string> = {
  pending: '화면 꺼짐 방지를 켜는 중입니다.',
  active: '화면 꺼짐 방지가 켜져 있습니다.',
  unsupported:
    '이 브라우저는 화면 꺼짐 방지를 지원하지 않습니다. 방송하는 동안 화면을 직접 켜 두세요. iPhone은 iOS 16.4 이상에서 지원합니다.',
  failed:
    '화면 꺼짐 방지를 켜지 못했습니다. 방송하는 동안 화면을 직접 켜 두세요.',
};

function CameraSwitch({
  capture,
  state,
  allowed,
  onReleaseTrack,
  onReplaceTrack,
}: {
  capture: CameraCapture;
  state: Extract<CameraCaptureState, { status: 'live' }>;
  allowed: boolean;
  onReleaseTrack: (kind: 'audio' | 'video') => void;
  onReplaceTrack: (track: MediaStreamTrack) => void;
}) {
  const [failed, setFailed] = useState(false);

  function switchCamera() {
    setFailed(false);
    onReleaseTrack('video');
    capture
      .switchCamera()
      .catch(() => setFailed(true))
      .finally(() => {
        // 전환에 실패해도 이전 카메라를 다시 열고, 그 카메라가 다시
        // 송출된다. 어떤 카메라도 다시 열지 못한 캡처는 이미 방송을 끝냈다.
        const video = capture.stream.getVideoTracks()[0];
        if (video) onReplaceTrack(video);
      });
  }

  return (
    <>
      {failed && (
        <p role="alert" className={styles.warning}>
          카메라를 바꾸지 못했습니다.
        </p>
      )}
      <button
        type="button"
        className={styles.secondary}
        disabled={state.switching || !allowed}
        onClick={switchCamera}
      >
        {state.facing === 'user' ? '후면 카메라로 전환' : '전면 카메라로 전환'}
      </button>
    </>
  );
}

function ScreenControls({
  capture,
  onReplaceTrack,
  onRestart,
}: {
  capture: PcCapture;
  onReplaceTrack: (track: MediaStreamTrack) => void;
  onRestart?: () => void;
}) {
  const state = useSyncExternalStore(capture.subscribe, capture.getState);
  const [reselectFailed, setReselectFailed] = useState(false);
  if (state.status === 'ended') return null;

  function reselect() {
    setReselectFailed(false);
    capture.reselectScreen().then(
      () => onReplaceTrack(capture.stream.getVideoTracks()[0]),
      () => setReselectFailed(true),
    );
  }

  return (
    <>
      <PcPreflight capture={capture} state={state} onRestart={onRestart} />
      {reselectFailed && (
        <p role="alert" className={styles.warning}>
          화면을 바꾸지 않았습니다.
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          aria-pressed={state.micMuted}
          onClick={() => capture.setMicMuted(!state.micMuted)}
        >
          {state.micMuted ? '마이크 켜기' : '마이크 끄기'}
        </button>
        <button
          type="button"
          className={
            state.hasScreenAudio
              ? styles.secondary
              : `${styles.secondary} ${styles.attention}`
          }
          onClick={reselect}
        >
          다시 선택
        </button>
      </div>
    </>
  );
}

function EndControl({ onEnd }: { onEnd: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        className={styles.secondary}
        onClick={() => setConfirming(true)}
      >
        방송 종료
      </button>
    );
  }
  return (
    <div className={styles.confirm} role="group" aria-label="종료 확인">
      <p className={styles.confirmText}>
        방송을 종료할까요? 종료하면 이 방송은 다시 시작할 수 없습니다.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.danger} onClick={onEnd}>
          종료하기
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setConfirming(false)}
        >
          취소
        </button>
      </div>
    </div>
  );
}

function StatusLine({
  slot,
  session,
  onAir,
  onAirWithoutCapture,
  publishingElsewhere,
}: {
  slot: CaptureSlot;
  session: PublishSessionState;
  onAir: boolean;
  onAirWithoutCapture: string;
  publishingElsewhere: boolean;
}) {
  switch (session.kind) {
    case 'requesting':
    case 'connecting':
      return (
        <p role="status" className={styles.note}>
          송출을 연결하는 중입니다.
        </p>
      );
    case 'live':
      return (
        <p role="status" className={styles.live}>
          송출 중입니다. 시청자가 방송을 볼 수 있습니다.
        </p>
      );
    case 'ending':
      return (
        <p role="status" className={styles.note}>
          방송을 종료하는 중입니다.
        </p>
      );
    case 'end-failed':
      return (
        <p role="alert" className={styles.warning}>
          {session.error}
        </p>
      );
    case 'ended':
      return null;
    case 'idle':
      break;
  }
  const elsewhereNote = (
    <p className={styles.note}>
      OBS나 다른 탭에서 송출 중입니다. 브라우저로 송출하려면 그 송출을 먼저
      멈추세요.
    </p>
  );
  switch (slot.kind) {
    case 'off':
      if (slot.notice) {
        return (
          <p role="alert" className={styles.warning}>
            {slot.notice}
          </p>
        );
      }
      if (publishingElsewhere) return elsewhereNote;
      return onAir ? (
        <p className={styles.note}>{onAirWithoutCapture}</p>
      ) : null;
    case 'acquiring':
      return (
        <p className={styles.note}>
          {CAPTURE_SOURCES[slot.source].acquiringText}
        </p>
      );
    case 'failed':
      return slot.permissionGuide ? (
        <PermissionGuide />
      ) : (
        <p role="alert" className={styles.warning}>
          {slot.message}
        </p>
      );
    case 'on':
      if (publishingElsewhere) return elsewhereNote;
      return session.error ? (
        <p role="alert" className={styles.warning}>
          {session.error}
        </p>
      ) : (
        <p className={styles.note}>
          미리보기 소리는 꺼져 있습니다. 준비되면 방송을 시작하세요.
        </p>
      );
  }
}
