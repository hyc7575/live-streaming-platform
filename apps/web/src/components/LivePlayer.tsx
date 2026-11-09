import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { llhlsPath, playbackPath, RETRY_DELAY_MS } from '../playback';
import styles from './LivePlayer.module.css';

export function LivePlayer({ broadcastId }: { broadcastId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

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
      };
      const onError = () => retry(load);
      video.addEventListener('error', onError);
      load();
      return () => {
        clearTimeout(timer);
        video.removeEventListener('error', onError);
        video.removeAttribute('src');
        video.load();
      };
    }

    let hls: Hls | null = null;
    const load = () => {
      const instance = new Hls({ lowLatencyMode: true });
      hls = instance;
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        instance.destroy();
        hls = null;
        retry(load);
      });
      instance.loadSource(src);
      instance.attachMedia(video);
    };
    load();
    return () => {
      clearTimeout(timer);
      hls?.destroy();
    };
  }, [broadcastId]);

  return (
    <div className={styles.player}>
      <video
        ref={videoRef}
        className={styles.video}
        aria-label="방송 화면"
        autoPlay
        muted
        playsInline
        controls
        onPlaying={() => setPlaying(true)}
      />
      {!playing && (
        <p role="status" className={styles.notice}>
          {unsupported
            ? '이 브라우저에서는 방송을 재생할 수 없습니다.'
            : '방송을 불러오는 중입니다'}
        </p>
      )}
    </div>
  );
}
