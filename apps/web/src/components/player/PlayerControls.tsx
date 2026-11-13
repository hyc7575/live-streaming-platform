import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { formatClock } from '../../elapsed';
import { FullscreenIcon, PauseIcon, PlayIcon, VolumeIcon } from './PlayerIcons';
import styles from './PlayerControls.module.css';
import { useMediaState } from './useMediaState';

// 재생 중인 소스의 라이브 엣지. 엔진이 알 수 없는 동안 position()은 null이다
// (playlist 로드 전, 또는 seekable 없는 네이티브 HLS).
export type LiveEdge = { position(): number | null; seek(): void };

export const LIVE_THRESHOLD_S = 3;
export const HIDE_DELAY_MS = 3000;
export const VOLUME_KEY = 'lime.player.volume';
const VOLUME_STEP = 0.1;
export const SEEK_STEP_S = 5;
const PLAYBACK_RATES: readonly number[] = [1, 1.25, 1.5, 2, 0.5];

type EdgeState = 'unknown' | 'live' | 'behind';

// iPhone Safari에는 요소 전체 화면이 없고, 영상 자체 플레이어만 있다.
type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

function storedVolume(): number | null {
  try {
    const value = Number(localStorage.getItem(VOLUME_KEY) ?? NaN);
    // 0을 저장하면 다음 방문이 소리 없이 시작되고 되돌릴 방법이 없다.
    return value > 0 && value <= 1 ? value : null;
  } catch {
    return null;
  }
}

function storeVolume(volume: number) {
  if (volume === 0) return;
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // 시크릿 모드거나 저장소가 막혔다. 그러면 볼륨을 기억하지 않을 뿐이다.
  }
}

// 포커스는 이벤트로 추적하지 않고 타이머가 울릴 때 읽는다. 포커스된
// 컨트롤이 언마운트되면(라이브로 이동이 LIVE로 바뀔 때) blur가 오지 않는다.
function hideWhenIdle(
  timer: RefObject<ReturnType<typeof setTimeout> | undefined>,
  container: RefObject<HTMLElement | null>,
  hide: () => void,
) {
  clearTimeout(timer.current);
  timer.current = setTimeout(function check() {
    const focused = document.activeElement;
    const box = container.current;
    if (box && focused !== box && box.contains(focused)) {
      timer.current = setTimeout(check, HIDE_DELAY_MS);
    } else {
      hide();
    }
  }, HIDE_DELAY_MS);
}

// 0.1씩 더하면 0.7000000000000001이 된다. 슬라이더가 보여 주는 값을 유지한다.
function roundVolume(volume: number) {
  return Math.min(1, Math.max(0, Math.round(volume * 100) / 100));
}

// 볼륨 0은 음소거만큼 조용하므로, 컨트롤은 둘 다 음소거로 다룬다.
function isSilent(video: { muted: boolean; volume: number }) {
  return video.muted || video.volume === 0;
}

function togglePlay(video: HTMLVideoElement) {
  if (video.paused) video.play().catch(() => {});
  else video.pause();
}

function cx(...names: (string | false | undefined)[]) {
  return names.filter(Boolean).join(' ');
}

export function PlayerControls({
  videoRef,
  live,
  children,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  live?: LiveEdge;
  // 영상(그리고 컨트롤 아래에서 영상 위에 그린 것).
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const media = useMediaState(videoRef);
  const [active, setActive] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [userSetMute, setUserSetMute] = useState(false);
  const [edge, setEdge] = useState<EdgeState>('unknown');
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tapWhileHidden = useRef(false);

  const shown = active || media.paused || dragging;
  // 녹화본에는 탐색할 끝이 있다. 라이브에는 대신 라이브 엣지가 있다.
  const seekable = !live && Number.isFinite(media.duration);
  const timeText = seekable
    ? `${formatClock(media.currentTime * 1000)} / ${formatClock(media.duration * 1000)}`
    : '';
  const showHint = media.muted && !userSetMute;

  function poke() {
    setActive(true);
    hideWhenIdle(hideTimer, containerRef, () => setActive(false));
  }

  useEffect(() => {
    const timer = hideTimer;
    hideWhenIdle(timer, containerRef, () => setActive(false));
    return () => clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const restored = storedVolume();
    if (restored !== null) video.volume = restored;
    const save = () => storeVolume(video.volume);
    video.addEventListener('volumechange', save);
    return () => video.removeEventListener('volumechange', save);
  }, [videoRef]);

  function readEdge(): EdgeState {
    const video = videoRef.current;
    const position = live?.position() ?? null;
    if (!video || position === null) return 'unknown';
    return position - video.currentTime > LIVE_THRESHOLD_S ? 'behind' : 'live';
  }

  const tick = useEffectEvent(() => setEdge(readEdge()));

  // 일시정지 중에는 timeupdate가 멈추지만, 멈춘 라이브 플레이어는 계속
  // 뒤처진다. 그래서 간격을 시계로 샘플링한다.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [live]);

  // 핸들러는 호출될 때 ref를 읽는다. 첫 렌더에서는 아직 null이다.
  function withVideo(action: (video: HTMLVideoElement) => void) {
    if (videoRef.current) action(videoRef.current);
  }

  function unmute(video: HTMLVideoElement) {
    setUserSetMute(true);
    if (video.volume === 0) video.volume = 1;
    video.muted = false;
  }

  function toggleMute(video: HTMLVideoElement) {
    if (isSilent(video)) {
      unmute(video);
    } else {
      setUserSetMute(true);
      video.muted = true;
    }
  }

  function toggleFullscreen() {
    const video: IosVideo | null = videoRef.current;
    const container = containerRef.current;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (container?.requestFullscreen) {
      container.requestFullscreen().catch(() => {});
    } else {
      video?.webkitEnterFullscreen?.();
    }
  }

  function cycleRate(video: HTMLVideoElement) {
    const next =
      PLAYBACK_RATES[
        (PLAYBACK_RATES.indexOf(media.playbackRate) + 1) % PLAYBACK_RATES.length
      ];
    // 새 src는 playbackRate를 기본값으로 되돌린다. 그래서 녹화의 다음 파트는
    // 둘 다 바꿔야 속도를 유지한다.
    video.defaultPlaybackRate = next;
    video.playbackRate = next;
  }

  function goLive(video: HTMLVideoElement) {
    live?.seek();
    video.play().catch(() => {});
    setEdge(readEdge());
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || event.ctrlKey || event.metaKey || event.altKey) return;
    poke();
    const target = event.target as HTMLElement;
    const onButton = target instanceof HTMLButtonElement;
    const onRange = target instanceof HTMLInputElement;
    // key가 아니라 event.code를 쓴다. 한국어 자판은 M을 ㅡ로 바꾼다.
    switch (event.code) {
      case 'Space':
      case 'KeyK':
        if (onButton && event.code === 'Space') return;
        togglePlay(video);
        break;
      case 'KeyM':
        toggleMute(video);
        break;
      case 'KeyF':
        toggleFullscreen();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (!seekable || onRange) return;
        video.currentTime = Math.min(
          video.duration,
          Math.max(
            0,
            video.currentTime +
              (event.code === 'ArrowRight' ? SEEK_STEP_S : -SEEK_STEP_S),
          ),
        );
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        if (onRange) return;
        video.volume = roundVolume(
          video.volume +
            (event.code === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP),
        );
        // 볼륨을 올린다는 것은 슬라이더처럼 시청자가 소리를 원한다는 뜻이다.
        if (event.code === 'ArrowUp' && video.muted) unmute(video);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    tapWhileHidden.current = event.pointerType === 'touch' && !shown;
    poke();
  }

  function onSurfaceClick(event: MouseEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || event.target !== video) return;
    // 휴대폰에서는 첫 탭이 컨트롤만 다시 보이게 한다.
    if (tapWhileHidden.current) return;
    togglePlay(video);
  }

  function onDragStart() {
    setDragging(true);
    const end = () => setDragging(false);
    document.addEventListener('pointerup', end, { once: true });
    document.addEventListener('pointercancel', end, { once: true });
  }

  const silent = isSilent(media);
  const volumeLevel = silent ? 'muted' : media.volume < 0.5 ? 'low' : 'high';

  return (
    <div
      ref={containerRef}
      className={cx(styles.container, !shown && styles.idle)}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={poke}
      onPointerDown={onPointerDown}
      onClick={onSurfaceClick}
      onDoubleClick={(event) => {
        if (event.target === videoRef.current) toggleFullscreen();
      }}
      onFocus={poke}
    >
      {children}
      {showHint && (
        <button
          type="button"
          className={styles.unmuteHint}
          onClick={() => withVideo(unmute)}
        >
          <VolumeIcon level="muted" />
          소리 켜기
        </button>
      )}
      {media.paused && media.ready && (
        <button
          type="button"
          className={styles.bigPlay}
          aria-label="재생"
          onClick={() => withVideo(togglePlay)}
        >
          <PlayIcon />
        </button>
      )}
      <div className={cx(styles.bar, !shown && styles.hidden)}>
        {seekable && (
          <input
            type="range"
            className={styles.seek}
            aria-label="재생 위치"
            aria-valuetext={timeText}
            min={0}
            max={media.duration}
            step="any"
            value={media.currentTime}
            onPointerDown={onDragStart}
            onChange={(event) => {
              const time = Number(event.currentTarget.value);
              withVideo((video) => {
                video.currentTime = time;
              });
            }}
          />
        )}
        <button
          type="button"
          className={styles.button}
          aria-label={media.paused ? '재생' : '일시정지'}
          onClick={() => withVideo(togglePlay)}
        >
          {media.paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <div className={styles.volumeGroup}>
          <button
            type="button"
            className={styles.button}
            aria-label={silent ? '음소거 해제' : '음소거'}
            onClick={() => withVideo(toggleMute)}
          >
            <VolumeIcon level={volumeLevel} />
          </button>
          <input
            type="range"
            className={styles.volume}
            aria-label="볼륨"
            min={0}
            max={1}
            step={0.05}
            // 음소거는 아무 소리도 내지 않으므로 슬라이더는 0을 보인다. 그 아래
            // 볼륨은 음소거를 풀 때를 위해 유지한다.
            value={silent ? 0 : media.volume}
            onPointerDown={onDragStart}
            onChange={(event) => {
              const volume = Number(event.currentTarget.value);
              withVideo((video) => {
                video.volume = volume;
                // 음소거 중에 슬라이더를 끄는 것은 시청자가 소리를 원한다는 뜻이다.
                if (video.muted && volume > 0) unmute(video);
              });
            }}
          />
        </div>
        {seekable && <span className={styles.time}>{timeText}</span>}
        {live &&
          (edge === 'behind' ? (
            <button
              type="button"
              className={cx(styles.live, styles.behind)}
              onClick={() => withVideo(goLive)}
            >
              <span className={styles.dot} aria-hidden="true" />
              라이브로 이동
            </button>
          ) : (
            <span className={styles.live}>
              <span className={styles.dot} aria-hidden="true" />
              LIVE
            </span>
          ))}
        {seekable && (
          <button
            type="button"
            className={cx(styles.button, styles.rate, styles.end)}
            aria-label={`재생 속도 ${media.playbackRate}배`}
            onClick={() => withVideo(cycleRate)}
          >
            {media.playbackRate}x
          </button>
        )}
        <button
          type="button"
          className={cx(styles.button, !seekable && styles.end)}
          aria-label={media.fullscreen ? '전체화면 종료' : '전체화면'}
          onClick={toggleFullscreen}
        >
          <FullscreenIcon exit={media.fullscreen} />
        </button>
      </div>
    </div>
  );
}
