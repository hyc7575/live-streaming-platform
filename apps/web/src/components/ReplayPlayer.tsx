import { useEffect, useRef } from 'react';
import type { Playhead } from '../replay-chat';
import { PlayerControls } from './player/PlayerControls';
import styles from './ReplayPlayer.module.css';

// `files` are paths under the recordings root, served same-origin at
// /recordings (Vite proxy in development, Caddy in production). A broadcast
// whose publish connection dropped and reconnected has one file per
// connection, played back to back. The parts share one video element, so
// the controls' subscriptions, volume and mute carry over between them.
// The caller holds which `part` plays, so the part picker (ReplayParts) can
// sit away from the player; a change of `part`, picked or reached at a
// part's end, starts it playing. `onPlayhead` hears where playback is once
// the viewer has played or seeked; until then nothing has been watched, so
// it hears nothing.
export function ReplayPlayer({
  files,
  part,
  onPart,
  onPlayhead,
}: {
  files: string[];
  part: number;
  onPart: (part: number) => void;
  onPlayhead?: (playhead: Playhead) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const started = useRef(false);
  const playedPart = useRef(part);

  useEffect(() => {
    if (playedPart.current === part) return;
    playedPart.current = part;
    started.current = true;
    onPlayhead?.({ part, seconds: 0 });
    // A browser that blocks playback leaves the controls for the viewer.
    videoRef.current?.play()?.catch(() => {});
  }, [part, onPlayhead]);

  const file = files[part];
  if (file === undefined) return null;
  const last = part === files.length - 1;

  function report() {
    const video = videoRef.current;
    if (started.current && video) {
      onPlayhead?.({ part, seconds: video.currentTime });
    }
  }

  return (
    <div className={styles.screen}>
      <PlayerControls videoRef={videoRef}>
        <video
          ref={videoRef}
          className={styles.video}
          src={`/recordings/${file}`}
          playsInline
          aria-label="다시보기 화면"
          onPlay={() => {
            started.current = true;
          }}
          onTimeUpdate={report}
          onSeeked={() => {
            started.current = true;
            report();
          }}
          onEnded={() => {
            if (!last) onPart(part + 1);
          }}
        />
      </PlayerControls>
    </div>
  );
}

// The 1부·2부 buttons of a recording split where the publish connection
// dropped, and why it is split. Nothing to pick with a single file.
export function ReplayParts({
  files,
  part,
  onPart,
}: {
  files: string[];
  part: number;
  onPart: (part: number) => void;
}) {
  if (files.length < 2) return null;
  return (
    <div className={styles.parts}>
      <div className={styles.buttons} role="group" aria-label="녹화 부분">
        {files.map((f, i) => (
          <button
            key={f}
            type="button"
            className={styles.part}
            aria-pressed={i === part}
            onClick={() => onPart(i)}
          >
            {i + 1}부
          </button>
        ))}
      </div>
      <p className={styles.note}>
        송출 연결이 끊겼다가 다시 이어진 곳에서 녹화가 나뉩니다. 한 부가 끝나면
        다음 부를 이어서 재생합니다.
      </p>
    </div>
  );
}
