import Hls from 'hls.js';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { llhlsPath, playbackPath, RETRY_DELAY_MS } from '../playback';
import styles from './LivePlayer.module.css';
import { PlayerControls, type LiveEdge } from './player/PlayerControls';

// Browsers refuse to start a video with sound before the visitor has
// interacted with the site. A muted video may always start, so that is the
// fallback; the viewer can unmute from the controls.
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
  // A playback failure can mean the broadcast ended, so the page rechecks
  // its status instead of waiting for the next poll (PRD §7.4 T9).
  onPlaybackError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Replaced on every retry, so the live edge reads whichever is current.
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
        // iPhone Safari loads nothing for a video with sound until asked to play.
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
