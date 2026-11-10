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
import { FullscreenIcon, PauseIcon, PlayIcon, VolumeIcon } from './PlayerIcons';
import styles from './PlayerControls.module.css';
import { useMediaState } from './useMediaState';

// The live edge of the playing source. position() is null while the engine
// cannot tell (before the playlist loads, or native HLS without seekable).
export type LiveEdge = { position(): number | null; seek(): void };

export const LIVE_THRESHOLD_S = 3;
export const HIDE_DELAY_MS = 3000;
export const VOLUME_KEY = 'lime.player.volume';
const VOLUME_STEP = 0.1;

type EdgeState = 'unknown' | 'live' | 'behind';

// iPhone Safari has no element fullscreen, only the video's own player.
type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

function storedVolume(): number | null {
  try {
    const value = Number(localStorage.getItem(VOLUME_KEY) ?? NaN);
    return value >= 0 && value <= 1 ? value : null;
  } catch {
    return null;
  }
}

function storeVolume(volume: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Private mode or blocked storage: the volume just is not remembered.
  }
}

// Focus is read when the timer fires, not tracked by events: a focused
// control that unmounts (라이브로 이동 turning into LIVE) sends no blur.
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
  // The video (and anything drawn over it beneath the controls).
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

  // timeupdate stops while paused, yet a paused live player keeps falling
  // behind, so the gap is sampled on a clock instead.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [live]);

  // Handlers read the ref when called: it is still null on the first render.
  function withVideo(action: (video: HTMLVideoElement) => void) {
    if (videoRef.current) action(videoRef.current);
  }

  function toggleMute(video: HTMLVideoElement) {
    setUserSetMute(true);
    video.muted = !video.muted;
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
    // event.code, not key: a Korean layout turns M into ㅡ.
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
      case 'ArrowUp':
      case 'ArrowDown':
        if (onRange) return;
        video.volume = Math.min(
          1,
          Math.max(
            0,
            video.volume +
              (event.code === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP),
          ),
        );
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
    // On a phone the first tap only brings the controls back.
    if (tapWhileHidden.current) return;
    togglePlay(video);
  }

  function onDragStart() {
    setDragging(true);
    const end = () => setDragging(false);
    document.addEventListener('pointerup', end, { once: true });
    document.addEventListener('pointercancel', end, { once: true });
  }

  const volumeLevel =
    media.muted || media.volume === 0
      ? 'muted'
      : media.volume < 0.5
        ? 'low'
        : 'high';

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
          onClick={() =>
            withVideo((video) => {
              setUserSetMute(true);
              // A remembered volume of 0 would unmute into silence.
              if (video.volume === 0) video.volume = 1;
              video.muted = false;
            })
          }
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
            aria-label={media.muted ? '음소거 해제' : '음소거'}
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
            value={media.volume}
            onPointerDown={onDragStart}
            onChange={(event) => {
              const volume = Number(event.currentTarget.value);
              withVideo((video) => {
                video.volume = volume;
                // Dragging the slider while muted means the viewer wants sound.
                if (video.muted && volume > 0) toggleMute(video);
              });
            }}
          />
        </div>
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
        <button
          type="button"
          className={cx(styles.button, styles.end)}
          aria-label={media.fullscreen ? '전체화면 종료' : '전체화면'}
          onClick={toggleFullscreen}
        >
          <FullscreenIcon exit={media.fullscreen} />
        </button>
      </div>
    </div>
  );
}
