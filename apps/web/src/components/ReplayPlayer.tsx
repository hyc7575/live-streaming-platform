import { useEffect, useRef } from 'react';
import type { Playhead } from '../replay-chat';
import { PlayerControls } from './player/PlayerControls';
import styles from './ReplayPlayer.module.css';

// `files`는 녹화 루트 아래 경로이고, 같은 출처의 /recordings로 제공된다
// (개발에서는 Vite proxy, 운영에서는 Caddy). 송출 연결이 끊겼다 다시 이어진
// 방송은 연결마다 파일이 하나씩 있고, 이어서 재생한다. 파트들은 video
// 요소 하나를 함께 쓰므로, 컨트롤의 구독·볼륨·음소거가 파트 사이에서
// 그대로 이어진다.
// 어느 `part`를 재생할지는 호출자가 들고 있어서, 파트 선택기(ReplayParts)가
// 플레이어와 떨어져 있을 수 있다. `part`가 바뀌면(골랐든 파트 끝에
// 닿았든) 재생을 시작한다. `onPlayhead`는 시청자가 재생하거나 탐색한 뒤부터
// 재생 위치를 받는다. 그 전에는 본 것이 없으므로
// 아무것도 받지 않는다.
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
    // 재생을 막는 브라우저에서는 컨트롤을 시청자에게 맡긴다.
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

// 송출 연결이 끊긴 곳에서 나뉜 녹화의 1부·2부 버튼과, 나뉜
// 이유. 파일이 하나면 고를 것이 없다.
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
