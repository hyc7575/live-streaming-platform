import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import {
  CameraCaptureError,
  startCameraCapture,
  type CameraCapture,
  type CameraCaptureEndReason,
  type CameraCaptureFailure,
} from '../capture/cameraCapture';
import {
  usePublishSession,
  type PublishSessionState,
} from '../publish/usePublishSession';
import { useApi } from '../use-api';
import styles from './PublishPage.module.css';

type Camera =
  | { kind: 'off'; notice: string | null }
  | { kind: 'acquiring' }
  | { kind: 'failed'; reason: CameraCaptureFailure }
  | { kind: 'on'; capture: CameraCapture };

const CAMERA_FAILURE: Record<CameraCaptureFailure, string> = {
  denied:
    '카메라·마이크 권한이 꺼져 있습니다. 주소창의 사이트 설정에서 허용한 뒤 다시 시도하세요.',
  'not-found': '카메라나 마이크를 찾지 못했습니다.',
  'in-use':
    '다른 앱이 카메라나 마이크를 쓰고 있습니다. 그 앱을 닫고 다시 시도하세요.',
  insecure:
    '이 주소에서는 카메라를 쓸 수 없습니다. https:// 로 시작하는 주소로 여세요.',
  unknown: '카메라를 켜지 못했습니다. 다시 시도하세요.',
};

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
  const [camera, setCamera] = useState<Camera>({ kind: 'off', notice: null });
  const videoRef = useRef<HTMLVideoElement>(null);
  const ended = session.state.kind === 'ended';
  // The server keeps the broadcast LIVE after a publish drops, and a page
  // opened on a LIVE broadcast has no publish of its own: either way the
  // streamer still needs a way to end it.
  const [onAir, setOnAir] = useState(broadcast.status === 'LIVE');
  if (session.state.kind === 'live' && !onAir) setOnAir(true);
  // Once the broadcast has ended, the capture has no further use: dropping
  // it here stops its tracks through the effect below.
  const capture = camera.kind === 'on' && !ended ? camera.capture : null;

  const onCaptureEnded = useEffectEvent(
    (which: CameraCapture, reason: CameraCaptureEndReason) => {
      const live = session.state.kind === 'live';
      let notice: string | null = null;
      if (reason === 'device-lost') {
        notice = live
          ? '카메라나 마이크가 꺼져 방송을 종료했습니다.'
          : '카메라나 마이크가 꺼져 송출을 멈췄습니다.';
      }
      setCamera((c) =>
        c.kind === 'on' && c.capture === which ? { kind: 'off', notice } : c,
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
    const unsubscribe = capture.subscribe(() => {
      const captureState = capture.getState();
      if (captureState.status === 'ended') {
        onCaptureEnded(capture, captureState.reason);
      }
    });
    return () => {
      unsubscribe();
      capture.stop();
    };
  }, [capture]);

  async function turnOnCamera() {
    setCamera({ kind: 'acquiring' });
    try {
      const next = await startCameraCapture();
      setCamera({ kind: 'on', capture: next });
    } catch (error) {
      const reason =
        error instanceof CameraCaptureError ? error.reason : 'unknown';
      setCamera({ kind: 'failed', reason });
    }
  }

  if (session.state.kind === 'ended') {
    const notice = camera.kind === 'off' ? camera.notice : null;
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

  return (
    <section className={styles.page}>
      <Heading broadcast={broadcast} />
      {capture ? (
        <video
          ref={videoRef}
          className={styles.preview}
          aria-label="미리보기"
          autoPlay
          muted
          playsInline
        />
      ) : (
        <div className={styles.placeholder}>
          <p className={styles.note}>카메라를 켜면 미리보기가 보입니다.</p>
        </div>
      )}
      <StatusLine camera={camera} session={session.state} onAir={onAir} />
      <div className={styles.actions}>
        {!capture && session.state.kind === 'idle' && (
          <button
            type="button"
            className={styles.primary}
            disabled={camera.kind === 'acquiring'}
            onClick={() => void turnOnCamera()}
          >
            카메라 켜기
          </button>
        )}
        {capture && !publishing && (
          <>
            <button
              type="button"
              className={styles.primary}
              disabled={session.state.kind !== 'idle'}
              onClick={() => session.start(capture.stream)}
            >
              방송 시작
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => capture.stop()}
            >
              카메라 끄기
            </button>
          </>
        )}
        {(session.state.kind === 'live' ||
          (session.state.kind === 'idle' && onAir)) && (
          <EndControl onEnd={session.end} />
        )}
        {session.state.kind === 'end-failed' && (
          <button type="button" className={styles.danger} onClick={session.end}>
            다시 종료하기
          </button>
        )}
      </div>
    </section>
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
  camera,
  session,
  onAir,
}: {
  camera: Camera;
  session: PublishSessionState;
  onAir: boolean;
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
  switch (camera.kind) {
    case 'off':
      if (camera.notice) {
        return (
          <p role="alert" className={styles.warning}>
            {camera.notice}
          </p>
        );
      }
      return onAir ? (
        <p className={styles.note}>
          이 방송은 아직 LIVE입니다. 카메라를 켜서 송출을 이어 가거나 방송을
          종료하세요.
        </p>
      ) : null;
    case 'acquiring':
      return <p className={styles.note}>카메라를 켜는 중입니다.</p>;
    case 'failed':
      return (
        <p role="alert" className={styles.warning}>
          {CAMERA_FAILURE[camera.reason]}
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
