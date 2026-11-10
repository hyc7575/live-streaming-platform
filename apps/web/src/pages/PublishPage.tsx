import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link, useParams } from 'react-router';
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
import {
  usePublishSession,
  type PublishSessionState,
} from '../publish/usePublishSession';
import { useApi } from '../use-api';
import {
  CAPTURE_SOURCES,
  endNotice,
  offeredSources,
  type ActiveCapture,
  type CaptureEndReason,
  type CaptureSlot,
  type CaptureSource,
} from './captureSources';
import styles from './PublishPage.module.css';

export function PublishPage() {
  const { id = '' } = useParams();
  const { state } = useAuth();
  const broadcast = useApi<Broadcast>(`/broadcasts/${encodeURIComponent(id)}`);

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
  // RequireAuth guarantees a user here; the API checks ownership again.
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

function PublishStudio({ broadcast }: { broadcast: Broadcast }) {
  const session = usePublishSession(broadcast.id);
  const [slot, setSlot] = useState<CaptureSlot>({ kind: 'off', notice: null });
  const [support] = useState(currentScreenAudioSupport);
  const sources = offeredSources(support);
  const videoRef = useRef<HTMLVideoElement>(null);
  // A capture that resolves after the page is gone must still be stopped, or
  // the browser keeps showing that the screen or camera is in use.
  const alive = useRef(false);
  const ended = session.state.kind === 'ended';
  // The server keeps the broadcast LIVE after a publish drops, and a page
  // opened on a LIVE broadcast has no publish of its own: either way the
  // streamer still needs a way to end it.
  const [onAir, setOnAir] = useState(broadcast.status === 'LIVE');
  if (session.state.kind === 'live' && !onAir) setOnAir(true);
  // Once the broadcast has ended, the capture has no further use: dropping
  // it here stops its tracks through the effect below.
  const active: ActiveCapture | null =
    slot.kind === 'on' && !ended ? slot : null;
  const capture = active?.capture ?? null;
  const camera = useCameraState(
    active?.source === 'camera' ? active.capture : null,
  );
  const cameraSwitching = camera?.status === 'live' && camera.switching;

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
    // The capture may end between the render that shows it and this effect,
    // and that change was announced before anyone listened.
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
    // T7: the mixer's AudioContext may only resume inside the click, or the
    // publish goes out silent.
    if (next.source === 'screen') void next.capture.resumeAudio();
    session.start(next.capture.stream);
  }

  if (session.state.kind === 'ended') {
    const notice = slot.kind === 'off' ? slot.notice : null;
    return (
      <section className={styles.page}>
        <Heading broadcast={broadcast} />
        <div className={styles.ended}>
          <p role="status" className={styles.endedText}>
            {session.state.elsewhere
              ? '방송이 종료되었습니다.'
              : '방송을 종료했습니다.'}
          </p>
          {notice && <p className={styles.note}>{notice}</p>}
          <div className={styles.actions}>
            <Link to={`/broadcasts/${broadcast.id}`} className={styles.primary}>
              시청 화면 보기
            </Link>
            <Link to="/studio" className={styles.secondary}>
              내 방송
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const publishing =
    session.state.kind === 'live' ||
    session.state.kind === 'ending' ||
    session.state.kind === 'end-failed';
  const offer = CAPTURE_SOURCES[sources[0]].offer;
  const desktop = sources.includes('screen');

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
            <p className={styles.note}>{offer.placeholder}</p>
          </div>
        )}
        <div className={styles.side}>
          {desktop && (!active || active.source === 'screen') && (
            <BrowserNotice support={support} />
          )}
          <StatusLine
            slot={slot}
            session={session.state}
            onAir={onAir}
            onAirWithoutCapture={offer.onAirWithoutCapture}
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
                  // A switch while the publish is being built could leave it
                  // with no camera track to replace.
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
                  className={index === 0 ? styles.primary : styles.secondary}
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
                  disabled={session.state.kind !== 'idle' || cameraSwitching}
                  onClick={() => startPublish(active)}
                >
                  방송 시작
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
            {(session.state.kind === 'live' ||
              (session.state.kind === 'idle' && onAir)) && (
              <EndControl onEnd={session.end} />
            )}
            {session.state.kind === 'end-failed' && (
              <button
                type="button"
                className={styles.danger}
                onClick={session.end}
              >
                다시 종료하기
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
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

/** Controls that only one capture source has. */
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
        // Even a failed switch reopens the previous camera, which goes out
        // again; a capture that could not reopen any has ended the broadcast.
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
}: {
  slot: CaptureSlot;
  session: PublishSessionState;
  onAir: boolean;
  onAirWithoutCapture: string;
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
  switch (slot.kind) {
    case 'off':
      if (slot.notice) {
        return (
          <p role="alert" className={styles.warning}>
            {slot.notice}
          </p>
        );
      }
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
