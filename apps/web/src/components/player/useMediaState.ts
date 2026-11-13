import { useCallback, useSyncExternalStore, type RefObject } from 'react';

export type MediaState = {
  paused: boolean;
  muted: boolean;
  volume: number;
  // readyState >= HAVE_METADATA: 로드 중이 아니라 이어서 재생할 화면이 있다.
  ready: boolean;
  fullscreen: boolean;
  currentTime: number;
  // 메타데이터 전에는 NaN, 라이브 소스는 Infinity.
  duration: number;
  playbackRate: number;
};

const VIDEO_EVENTS = [
  'play',
  'pause',
  'volumechange',
  'loadedmetadata',
  'emptied',
  'timeupdate',
  'durationchange',
  'seeked',
  'ratechange',
] as const;

const INITIAL: MediaState = {
  paused: true,
  muted: false,
  volume: 1,
  ready: false,
  fullscreen: false,
  currentTime: 0,
  duration: NaN,
  playbackRate: 1,
};

// useSyncExternalStore는 바뀐 것이 없는 동안 같은 객체를 돌려받아야 한다.
const snapshots = new WeakMap<HTMLVideoElement, MediaState>();

function read(video: HTMLVideoElement): MediaState {
  const next: MediaState = {
    paused: video.paused,
    muted: video.muted,
    volume: video.volume,
    ready: video.readyState >= HTMLMediaElement.HAVE_METADATA,
    fullscreen: document.fullscreenElement?.contains(video) ?? false,
    currentTime: video.currentTime,
    duration: video.duration,
    playbackRate: video.playbackRate,
  };
  const previous = snapshots.get(video);
  if (
    previous &&
    (Object.keys(next) as (keyof MediaState)[]).every((key) =>
      Object.is(previous[key], next[key]),
    )
  ) {
    return previous;
  }
  snapshots.set(video, next);
  return next;
}

export function useMediaState(
  videoRef: RefObject<HTMLVideoElement | null>,
): MediaState {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const video = videoRef.current;
      if (!video) return () => {};
      for (const name of VIDEO_EVENTS) video.addEventListener(name, onChange);
      document.addEventListener('fullscreenchange', onChange);
      return () => {
        for (const name of VIDEO_EVENTS) {
          video.removeEventListener(name, onChange);
        }
        document.removeEventListener('fullscreenchange', onChange);
      };
    },
    [videoRef],
  );
  return useSyncExternalStore(subscribe, () =>
    videoRef.current ? read(videoRef.current) : INITIAL,
  );
}
