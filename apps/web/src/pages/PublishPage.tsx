import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import {
  CameraCaptureError,
  startCameraCapture,
  type CameraCapture,
  type CameraCaptureFailure,
} from '../capture/cameraCapture';
import {
  startWhipPublish,
  type PublishEvent,
  type WhipPublisher,
} from '../publish/whipPublisher';
import { useApi } from '../use-api';
import type { LoginPageState } from './LoginPage';
import styles from './PublishPage.module.css';

interface PublishTicket {
  publishUrl: string;
  expiresAt: string;
}

type Phase =
  | { kind: 'off'; notice: string | null }
  | { kind: 'acquiring' }
  | { kind: 'camera-failed'; reason: CameraCaptureFailure }
  | { kind: 'preview'; capture: CameraCapture; error: string | null }
  | { kind: 'requesting'; capture: CameraCapture }
  | { kind: 'connecting'; capture: CameraCapture; publisher: WhipPublisher }
  | { kind: 'live'; capture: CameraCapture; publisher: WhipPublisher };

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

function tokenErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return '송출을 시작하지 못했습니다. 잠시 후 다시 시도하세요.';
  }
  switch (error.status) {
    case 403:
      return '권한이 없습니다.';
    case 404:
      return '방송을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.';
    case 409:
      return error.serverMessage ?? '지금은 이 방송을 송출할 수 없습니다.';
    default:
      return '송출을 시작하지 못했습니다. 잠시 후 다시 시도하세요.';
  }
}

function publishErrorMessage(
  event: Exclude<PublishEvent, { kind: 'connected' }>,
): string {
  if (event.kind === 'disconnected') {
    return '송출 연결이 끊겼습니다. 다시 시작하세요.';
  }
  return event.status === 401
    ? '송출이 허가되지 않았습니다. 다시 시도하세요.'
    : '송출 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
}

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
  return <PublishStudio broadcast={b} />;
}

function PublishStudio({ broadcast }: { broadcast: Broadcast }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'off', notice: null });
  const videoRef = useRef<HTMLVideoElement>(null);
  // Bumped whenever a start attempt stops mattering (stop, unmount), so a
  // token that arrives late never opens a connection nobody will close.
  const attempt = useRef(0);

  const capture = 'capture' in phase ? phase.capture : null;
  const publisher = 'publisher' in phase ? phase.publisher : null;

  useEffect(() => {
    if (!capture) return;
    if (videoRef.current) videoRef.current.srcObject = capture.stream;
    const unsubscribe = capture.subscribe(() => {
      const captureState = capture.getState();
      if (captureState.status !== 'ended') return;
      attempt.current += 1;
      const notice =
        captureState.reason === 'device-lost'
          ? '카메라나 마이크가 꺼져 송출을 멈췄습니다.'
          : null;
      setPhase((p) =>
        'capture' in p && p.capture === capture ? { kind: 'off', notice } : p,
      );
    });
    return () => {
      unsubscribe();
      capture.stop();
    };
  }, [capture]);

  useEffect(() => {
    if (!publisher) return;
    return () => publisher.stop();
  }, [publisher]);

  useEffect(
    () => () => {
      attempt.current += 1;
    },
    [],
  );

  async function turnOnCamera() {
    setPhase({ kind: 'acquiring' });
    try {
      const next = await startCameraCapture();
      setPhase({ kind: 'preview', capture: next, error: null });
    } catch (error) {
      const reason =
        error instanceof CameraCaptureError ? error.reason : 'unknown';
      setPhase({ kind: 'camera-failed', reason });
    }
  }

  async function startPublishing(current: CameraCapture) {
    const mine = ++attempt.current;
    setPhase({ kind: 'requesting', capture: current });
    let ticket: PublishTicket;
    try {
      ticket = await apiFetch<PublishTicket>(
        `/broadcasts/${broadcast.id}/publish-token`,
        { method: 'POST' },
      );
    } catch (error) {
      if (mine !== attempt.current) return;
      if (error instanceof ApiError && error.status === 401) {
        const next: LoginPageState = {
          from: `/studio/broadcasts/${broadcast.id}`,
        };
        void navigate('/login', { state: next });
        return;
      }
      setPhase({
        kind: 'preview',
        capture: current,
        error: tokenErrorMessage(error),
      });
      return;
    }
    if (mine !== attempt.current) return;
    const next = startWhipPublish(
      current.stream,
      ticket.publishUrl,
      (event) => {
        setPhase((p) => {
          if (!('publisher' in p) || p.publisher !== next) return p;
          if (event.kind === 'connected') {
            return { kind: 'live', capture: current, publisher: next };
          }
          return {
            kind: 'preview',
            capture: current,
            error: publishErrorMessage(event),
          };
        });
      },
    );
    setPhase({ kind: 'connecting', capture: current, publisher: next });
  }

  return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{broadcast.title}</h1>
        <Link to={`/broadcasts/${broadcast.id}`} target="_blank">
          시청 화면 열기
        </Link>
      </div>
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
      <PhaseStatus phase={phase} />
      <div className={styles.actions}>
        {(phase.kind === 'off' ||
          phase.kind === 'acquiring' ||
          phase.kind === 'camera-failed') && (
          <button
            type="button"
            className={styles.primary}
            disabled={phase.kind === 'acquiring'}
            onClick={() => void turnOnCamera()}
          >
            카메라 켜기
          </button>
        )}
        {(phase.kind === 'preview' ||
          phase.kind === 'requesting' ||
          phase.kind === 'connecting') && (
          <button
            type="button"
            className={styles.primary}
            disabled={phase.kind !== 'preview'}
            onClick={() => void startPublishing(phase.capture)}
          >
            방송 시작
          </button>
        )}
        {capture && (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => capture.stop()}
          >
            {phase.kind === 'live' ? '송출 중지' : '카메라 끄기'}
          </button>
        )}
      </div>
    </section>
  );
}

function PhaseStatus({ phase }: { phase: Phase }) {
  switch (phase.kind) {
    case 'off':
      return phase.notice ? (
        <p role="alert" className={styles.warning}>
          {phase.notice}
        </p>
      ) : null;
    case 'acquiring':
      return <p className={styles.note}>카메라를 켜는 중입니다.</p>;
    case 'camera-failed':
      return (
        <p role="alert" className={styles.warning}>
          {CAMERA_FAILURE[phase.reason]}
        </p>
      );
    case 'preview':
      return phase.error ? (
        <p role="alert" className={styles.warning}>
          {phase.error}
        </p>
      ) : (
        <p className={styles.note}>
          미리보기 소리는 꺼져 있습니다. 준비되면 방송을 시작하세요.
        </p>
      );
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
  }
}
