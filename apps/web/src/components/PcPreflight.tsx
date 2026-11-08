import { useEffect, useRef, useState } from 'react';
import type { PcCapture, PcCaptureState } from '../capture/pcCapture';
import type { ScreenAudioSupport } from '../capture/screenAudioSupport';
import styles from './PcPreflight.module.css';

type LiveState = Extract<PcCaptureState, { status: 'live' }>;

// Below this RMS the screen meter barely moves; a playing tab sits far above it.
const HEARD_LEVEL = 0.005;
const SILENT_AFTER_MS = 3000;

const BROWSER_NOTICES: Record<
  Exclude<ScreenAudioSupport, 'supported'>,
  { tone: 'warning' | 'note'; text: string }
> = {
  'no-screen-audio': {
    tone: 'warning',
    text: '이 브라우저는 화면 소리를 공유하지 못합니다. 화면 소리까지 송출하려면 PC의 Chrome이나 Edge에서 이 화면을 여세요.',
  },
  'no-screen-capture': {
    tone: 'warning',
    text: '이 브라우저는 화면 공유를 지원하지 않습니다. PC의 Chrome이나 Edge에서 이 화면을 여세요.',
  },
  unverified: {
    tone: 'note',
    text: '화면 소리는 Chrome과 Edge에서만 확인했습니다. 화면 소리가 잡히지 않으면 Chrome이나 Edge에서 여세요.',
  },
};

export function BrowserNotice({ support }: { support: ScreenAudioSupport }) {
  if (support === 'supported') return null;
  const notice = BROWSER_NOTICES[support];
  return notice.tone === 'warning' ? (
    <p role="alert" className={styles.warning}>
      {notice.text}
    </p>
  ) : (
    <p className={styles.note}>{notice.text}</p>
  );
}

/** Level meters and the checks a streamer should clear before going live. */
export function PcPreflight({
  capture,
  state,
  onRestart,
}: {
  capture: PcCapture;
  state: LiveState;
  onRestart: () => void;
}) {
  const screenSilent = useScreenSilent(capture);

  return (
    <section className={styles.preflight} aria-label="송출 사전 점검">
      <div className={styles.meters}>
        <LevelMeter capture={capture} source="mic" label="마이크" />
        <LevelMeter capture={capture} source="screen" label="화면 소리" />
      </div>
      {state.micLost && (
        <div role="alert" className={styles.warning}>
          <p>
            마이크 연결이 끊겼습니다. 마이크를 다시 연결한 뒤 &lsquo;처음부터
            다시&rsquo;를 누르세요.
          </p>
          <button type="button" onClick={onRestart}>
            처음부터 다시
          </button>
        </div>
      )}
      {!state.hasScreenAudio && (
        <p role="alert" className={styles.warning}>
          화면 소리가 잡히지 않습니다. &lsquo;다시 선택&rsquo;을 누르고 공유
          창의 &lsquo;Chrome 탭&rsquo;에서 탭을 고른 뒤 &lsquo;탭 오디오와 함께
          공유&rsquo;를 켜세요. Windows에서 전체 화면을 공유할 때는
          &lsquo;시스템 오디오와 함께 공유&rsquo;를 켜세요.
        </p>
      )}
      {state.hasScreenAudio && state.audioRunning && screenSilent && (
        <p role="status" className={styles.note}>
          화면 소리가 아직 들리지 않습니다. 고른 탭에서 소리를 재생해 보세요.
        </p>
      )}
    </section>
  );
}

function useScreenSilent(capture: PcCapture) {
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    let lastHeard = performance.now();
    const timer = setInterval(() => {
      const level = capture.readLevels().screen;
      const now = performance.now();
      if (level === null || level > HEARD_LEVEL) lastHeard = now;
      setSilent(now - lastHeard > SILENT_AFTER_MS);
    }, 200);
    return () => clearInterval(timer);
  }, [capture]);

  return silent;
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
      <span className={styles.meterLabel}>{label}</span>
      <meter ref={meterRef} min={0} max={1} value={0} />
    </label>
  );
}
