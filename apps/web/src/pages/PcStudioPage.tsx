import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  PcCaptureError,
  startPcCapture,
  type PcCapture,
} from '../capture/pcCapture';
import styles from './PcStudioPage.module.css';

type Phase =
  | { kind: 'idle' }
  | { kind: 'acquiring' }
  | { kind: 'failed'; message: string }
  | { kind: 'active'; capture: PcCapture };

function failureMessage(error: unknown) {
  if (error instanceof PcCaptureError && error.source === 'mic') {
    return '마이크를 쓸 수 없습니다. 브라우저의 마이크 권한을 확인하세요.';
  }
  return '화면을 선택하지 않았습니다. 다시 선택하세요.';
}

export function PcStudioPage() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const capture = phase.kind === 'active' ? phase.capture : null;

  useEffect(() => {
    if (!capture) return;
    return () => capture.stop();
  }, [capture]);

  async function selectScreen() {
    setPhase({ kind: 'acquiring' });
    try {
      setPhase({ kind: 'active', capture: await startPcCapture() });
    } catch (error) {
      setPhase({ kind: 'failed', message: failureMessage(error) });
    }
  }

  return (
    <section className={styles.page}>
      <h1>PC 송출 미리보기</h1>
      <p className={styles.note}>
        화면과 마이크를 한 번에 섞어 미리 봅니다. 아직 송출하지 않습니다.
      </p>
      {capture ? (
        <CapturePanel
          capture={capture}
          onSelectAgain={() => void selectScreen()}
        />
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={phase.kind === 'acquiring'}
            onClick={() => void selectScreen()}
          >
            화면 선택
          </button>
          {phase.kind === 'failed' && (
            <p role="alert" className={styles.warning}>
              {phase.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function CapturePanel({
  capture,
  onSelectAgain,
}: {
  capture: PcCapture;
  onSelectAgain: () => void;
}) {
  const state = useSyncExternalStore(capture.subscribe, capture.getState);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reselectFailed, setReselectFailed] = useState(false);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = capture.stream;
  }, [capture]);

  if (state.status === 'ended') {
    return (
      <div className={styles.actions}>
        <p role="status">
          {state.reason === 'share-stopped'
            ? '화면 공유가 끝났습니다.'
            : '미리보기를 끝냈습니다.'}
        </p>
        <button
          type="button"
          className={styles.primary}
          onClick={onSelectAgain}
        >
          화면 선택
        </button>
      </div>
    );
  }

  function reselect() {
    setReselectFailed(false);
    capture.reselectScreen().catch(() => setReselectFailed(true));
  }

  return (
    <div className={styles.panel}>
      <video
        ref={videoRef}
        className={styles.preview}
        aria-label="미리보기"
        autoPlay
        muted
        playsInline
      />
      <div className={styles.meters}>
        <LevelMeter capture={capture} source="mic" label="마이크" />
        <LevelMeter capture={capture} source="screen" label="화면 소리" />
      </div>
      <p role="status" className={styles.note}>
        {state.hasScreenAudio ? '화면 소리 있음' : '화면 소리 없음'} ·{' '}
        {state.audioRunning ? '오디오 동작 중' : '오디오 멈춤'}
      </p>
      {reselectFailed && (
        <p role="alert" className={styles.warning}>
          화면을 바꾸지 않았습니다.
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => void capture.resumeAudio()}
        >
          방송 시작
        </button>
        <button
          type="button"
          aria-pressed={state.micMuted}
          onClick={() => capture.setMicMuted(!state.micMuted)}
        >
          {state.micMuted ? '마이크 켜기' : '마이크 끄기'}
        </button>
        <button type="button" onClick={reselect}>
          다시 선택
        </button>
        <button type="button" onClick={() => capture.stop()}>
          미리보기 끝내기
        </button>
      </div>
    </div>
  );
}

function LevelMeter({
  capture,
  source,
  label,
}: {
  capture: PcCapture;
  source: 'mic' | 'screen';
  label: string;
}) {
  const meterRef = useRef<HTMLMeterElement>(null);

  useEffect(() => {
    let frame = requestAnimationFrame(function tick() {
      const level = capture.readLevels()[source];
      if (meterRef.current) meterRef.current.value = level ?? 0;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [capture, source]);

  return (
    <label className={styles.meter}>
      {label}
      <meter ref={meterRef} min={0} max={1} value={0} />
    </label>
  );
}
