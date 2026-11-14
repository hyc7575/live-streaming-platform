import Hls from 'hls.js';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { llhlsPath, playbackPath, RETRY_DELAY_MS } from '../playback';
import styles from './LivePlayer.module.css';
import { PlayerControls, type LiveEdge } from './player/PlayerControls';

// 브라우저는 방문자가 사이트와 상호작용하기 전에는 소리 있는 영상을
// 시작하지 않는다. 음소거한 영상은 언제나 시작할 수 있으므로 이것을
// 대안으로 쓴다. 시청자는 컨트롤에서 음소거를 풀 수 있다.
function play(video: HTMLVideoElement) {
  video.play().catch((error: unknown) => {
    if (
      error instanceof DOMException &&
      error.name === 'NotAllowedError' &&
      !video.muted
    ) {
      video.muted = true;
      video.play().catch(() => {});
    }
  });
}

export function LivePlayer({
  broadcastId,
  startMuted,
  onPlaybackError,
}: {
  broadcastId: string;
  startMuted: boolean;
  // 재생 실패는 방송 종료를 뜻할 수 있으므로, 페이지가 다음 폴링을 기다리지
  // 않고 상태를 다시 확인한다(PRD §7.4 T9).
  onPlaybackError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // 재시도마다 교체되므로, 라이브 엣지는 그때 현재인 것을 읽는다.
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const reportError = useEffectEvent(() => onPlaybackError?.());

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const src = llhlsPath(broadcastId);
    const path = playbackPath(video);
    if (path === 'unsupported') {
      setUnsupported(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const retry = (load: () => void) => {
      setPlaying(false);
      timer = setTimeout(load, RETRY_DELAY_MS);
    };

    if (path === 'native') {
      const load = () => {
        video.src = src;
        // iPhone Safari는 소리 있는 영상을 재생 요청 전까지 아무것도 로드하지 않는다.
        play(video);
      };
      const onError = () => {
        reportError();
        retry(load);
      };
      const onStalled = () => reportError();
      video.addEventListener('error', onError);
      video.addEventListener('stalled', onStalled);
      load();
      return () => {
        clearTimeout(timer);
        video.removeEventListener('error', onError);
        video.removeEventListener('stalled', onStalled);
        video.removeAttribute('src');
        video.load();
      };
    }

    const load = () => {
      const instance = new Hls({ lowLatencyMode: true });
      hlsRef.current = instance;
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        instance.destroy();
        hlsRef.current = null;
        reportError();
        retry(load);
      });
      instance.loadSource(src);
      instance.attachMedia(video);
    };
    load();
    return () => {
      clearTimeout(timer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [broadcastId]);

  const live = useMemo<LiveEdge>(() => {
    const position = () => {
      const video = videoRef.current;
      if (!video) return null;
      if (hlsRef.current) return hlsRef.current.liveSyncPosition;
      const { seekable } = video;
      return seekable.length ? seekable.end(seekable.length - 1) : null;
    };
    return {
      position,
      seek: () => {
        const edge = position();
        if (edge !== null && videoRef.current) {
          videoRef.current.currentTime = edge;
        }
      },
    };
  }, []);

  return (
    <PlayerControls videoRef={videoRef} live={live}>
      <video
        ref={videoRef}
        className={styles.video}
        aria-label="방송 화면"
        autoPlay
        muted={startMuted}
        playsInline
        onLoadedMetadata={(event) => play(event.currentTarget)}
        onPlaying={() => setPlaying(true)}
      />
      {!playing && (
        <p role="status" className={styles.notice}>
          {unsupported
            ? '이 브라우저에서는 방송을 재생할 수 없습니다.'
            : '방송을 불러오는 중입니다'}
        </p>
      )}
    </PlayerControls>
  );
}
