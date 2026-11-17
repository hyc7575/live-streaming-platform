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

// 볼륨 0은 음소거만큼 조용하므로, 컨트롤과 후원 읽어 주기는 둘 다 무음으로 다룬다.
export function isSilent(video: { muted: boolean; volume: number }): boolean {
  return video.muted || video.volume === 0;
}

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
// 스냅숏은 video 이벤트가 올 때만 다시 읽는다. Safari(iPhone)는 재생 중
// currentTime을 읽을 때마다 새 값을 주므로, getSnapshot이 매번 video를 읽으면
// 렌더 뒤 재확인마다 값이 달라 렌더가 끝나지 않는다(React #185).
const snapshots = new WeakMap<HTMLVideoElement, MediaState>();

function refresh(video: HTMLVideoElement, trackTime = true): MediaState {
  const previous = snapshots.get(video);
  const next: MediaState = {
    paused: video.paused,
    muted: video.muted,
    volume: video.volume,
    ready: video.readyState >= HTMLMediaElement.HAVE_METADATA,
    fullscreen: document.fullscreenElement?.contains(video) ?? false,
    // 시간을 따라가지 않으면 이전 값을 그대로 둬, timeupdate가 스냅숏을 바꾸지 않는다.
    currentTime: trackTime ? video.currentTime : (previous?.currentTime ?? 0),
    duration: video.duration,
    playbackRate: video.playbackRate,
  };
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

// trackTime을 끄면 currentTime이 바뀌어도 다시 렌더하지 않는다(라이브: 시간 표시가 없다).
// 이때 snapshot.currentTime은 갱신되지 않으므로 읽지 않는다.
export function useMediaState(
  videoRef: RefObject<HTMLVideoElement | null>,
  trackTime = true,
): MediaState {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const video = videoRef.current;
      if (!video) return () => {};
      const update = () => {
        refresh(video, trackTime);
        onChange();
      };
      for (const name of VIDEO_EVENTS) video.addEventListener(name, update);
      document.addEventListener('fullscreenchange', update);
      // 첫 렌더와 구독 사이에 바뀐 것을 놓치지 않는다.
      update();
      return () => {
        for (const name of VIDEO_EVENTS) {
          video.removeEventListener(name, update);
        }
        document.removeEventListener('fullscreenchange', update);
      };
    },
    [videoRef, trackTime],
  );
  const getSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video) return INITIAL;
    return snapshots.get(video) ?? refresh(video, trackTime);
  }, [videoRef, trackTime]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
