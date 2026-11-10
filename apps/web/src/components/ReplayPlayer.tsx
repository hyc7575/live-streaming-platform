import { useEffect, useRef, useState } from 'react';
import { PlayerControls } from './player/PlayerControls';
import styles from './ReplayPlayer.module.css';

// `files` are paths under the recordings root, served same-origin at
// /recordings (Vite proxy in development, Caddy in production). A broadcast
// whose publish connection dropped and reconnected has one file per
// connection, played back to back. The parts share one video element, so
// the controls' subscriptions, volume and mute carry over between them.
export function ReplayPlayer({ files }: { files: string[] }) {
  const [current, setCurrent] = useState({ part: 0, play: false });
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!current.play) return;
    // A browser that blocks playback leaves the controls for the viewer.
    videoRef.current?.play()?.catch(() => {});
  }, [current]);

  const file = files[current.part];
  if (file === undefined) return null;
  const last = current.part === files.length - 1;

  return (
    <div>
      <div className={styles.screen}>
        <PlayerControls videoRef={videoRef}>
          <video
            ref={videoRef}
            className={styles.video}
            src={`/recordings/${file}`}
            playsInline
            aria-label="다시보기 화면"
            onEnded={() => {
              if (!last) setCurrent({ part: current.part + 1, play: true });
            }}
          />
        </PlayerControls>
      </div>
      {files.length > 1 && (
        <div className={styles.parts}>
          <div className={styles.buttons} role="group" aria-label="녹화 부분">
            {files.map((f, i) => (
              <button
                key={f}
                type="button"
                className={styles.part}
                aria-pressed={i === current.part}
                onClick={() => setCurrent({ part: i, play: true })}
              >
                {i + 1}부
              </button>
            ))}
          </div>
          <p className={styles.note}>
            송출 연결이 끊겼다가 다시 이어진 곳에서 녹화가 나뉩니다. 한 부가
            끝나면 다음 부를 이어서 재생합니다.
          </p>
        </div>
      )}
    </div>
  );
}
