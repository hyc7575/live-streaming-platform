import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  CameraCaptureError,
  startCameraCapture,
  type CameraCapture,
  type CameraCaptureFailure,
  type WakeLockStatus,
} from '../capture/cameraCapture';
import styles from './MobileStudioPage.module.css';

type Phase =
  | { kind: 'idle' }
  | { kind: 'acquiring' }
  | { kind: 'failed'; reason: CameraCaptureFailure }
  | { kind: 'active'; capture: CameraCapture };

const FAILURE_MESSAGES: Record<
  Exclude<CameraCaptureFailure, 'denied'>,
  string
> = {
  'not-found':
    '카메라나 마이크를 찾지 못했습니다. 카메라와 마이크가 있는 기기에서 여세요.',
  'in-use':
    '다른 앱이 카메라나 마이크를 쓰고 있습니다. 그 앱을 닫고 다시 시도하세요.',
  insecure:
    '이 주소에서는 카메라를 쓸 수 없습니다. https:// 로 시작하는 주소로 여세요.',
  unknown: '카메라를 켜지 못했습니다. 다시 시도하세요.',
};

const WAKE_LOCK_MESSAGES: Record<WakeLockStatus, string> = {
  pending: '화면 꺼짐 방지를 켜는 중입니다.',
  active: '화면 꺼짐 방지가 켜져 있습니다.',
  unsupported:
    '이 브라우저는 화면 꺼짐 방지를 지원하지 않습니다. 방송하는 동안 화면을 직접 켜 두세요. iPhone은 iOS 16.4 이상에서 지원합니다.',
  failed:
    '화면 꺼짐 방지를 켜지 못했습니다. 방송하는 동안 화면을 직접 켜 두세요.',
};

export function MobileStudioPage() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const capture = phase.kind === 'active' ? phase.capture : null;

  useEffect(() => {
    if (!capture) return;
    return () => capture.stop();
  }, [capture]);

  async function startCamera() {
    setPhase({ kind: 'acquiring' });
    try {
      setPhase({ kind: 'active', capture: await startCameraCapture() });
    } catch (error) {
      const reason =
        error instanceof CameraCaptureError ? error.reason : 'unknown';
      setPhase({ kind: 'failed', reason });
    }
  }

  return (
    <section className={styles.page}>
      <h1>모바일 송출 미리보기</h1>
      <p className={styles.note}>
        카메라와 마이크를 켜고 미리 봅니다. 아직 송출하지 않습니다.
      </p>
      {capture ? (
        <CapturePanel capture={capture} onRestart={() => void startCamera()} />
      ) : (
        <>
          {phase.kind === 'failed' &&
            (phase.reason === 'denied' ? (
              <PermissionGuide />
            ) : (
              <p role="alert" className={styles.warning}>
                {FAILURE_MESSAGES[phase.reason]}
              </p>
            ))}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={phase.kind === 'acquiring'}
              onClick={() => void startCamera()}
            >
              {phase.kind === 'failed' ? '다시 시도' : '카메라 켜기'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function PermissionGuide() {
  return (
    <div role="alert" className={styles.guide}>
      <h2>카메라·마이크 권한이 꺼져 있습니다</h2>
      <p>아래 방법으로 권한을 허용한 뒤 이 페이지를 새로고침하세요.</p>
      <h3>iPhone (Safari)</h3>
      <ol>
        <li>주소창 왼쪽의 페이지 메뉴(aA) 버튼을 누릅니다.</li>
        <li>
          &quot;웹 사이트 설정&quot;에서 카메라와 마이크를 &quot;허용&quot;으로
          바꿉니다.
        </li>
        <li>
          메뉴에 없으면 설정 앱 → Safari → 카메라·마이크를 &quot;묻기&quot;로
          바꿉니다.
        </li>
      </ol>
      <h3>Android (Chrome)</h3>
      <ol>
        <li>주소창 왼쪽의 사이트 정보 아이콘을 누릅니다.</li>
        <li>&quot;권한&quot;에서 카메라와 마이크를 허용합니다.</li>
        <li>
          목록에 없으면 휴대폰 설정 → 애플리케이션 → Chrome → 권한에서
          카메라·마이크를 허용합니다.
        </li>
      </ol>
    </div>
  );
}

function CapturePanel({
  capture,
  onRestart,
}: {
  capture: CameraCapture;
  onRestart: () => void;
}) {
  const state = useSyncExternalStore(capture.subscribe, capture.getState);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [switchFailed, setSwitchFailed] = useState(false);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = capture.stream;
  }, [capture]);

  if (state.status === 'ended') {
    return (
      <>
        <p role="status">
          {state.reason === 'device-lost'
            ? '카메라나 마이크가 꺼졌습니다.'
            : '미리보기를 끝냈습니다.'}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onRestart}>
            카메라 켜기
          </button>
        </div>
      </>
    );
  }

  function switchCamera() {
    setSwitchFailed(false);
    capture.switchCamera().catch(() => setSwitchFailed(true));
  }

  return (
    <>
      <p role="status" className={styles.note}>
        {state.facing === 'user' ? '전면 카메라' : '후면 카메라'} ·{' '}
        {WAKE_LOCK_MESSAGES[state.wakeLock]}
      </p>
      <video
        ref={videoRef}
        className={styles.preview}
        data-mirrored={state.facing === 'user'}
        aria-label="미리보기"
        autoPlay
        muted
        playsInline
      />
      {switchFailed && (
        <p role="alert" className={styles.warning}>
          카메라를 바꾸지 못했습니다.
        </p>
      )}
      <div className={styles.actions}>
        {state.canSwitchCamera && (
          <button
            type="button"
            disabled={state.switching}
            onClick={switchCamera}
          >
            {state.facing === 'user'
              ? '후면 카메라로 전환'
              : '전면 카메라로 전환'}
          </button>
        )}
        <button type="button" onClick={() => capture.stop()}>
          미리보기 끝내기
        </button>
      </div>
    </>
  );
}
