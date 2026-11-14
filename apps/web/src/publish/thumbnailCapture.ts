import { useEffect, type RefObject } from 'react';
import { apiFetch } from '../api';

export const CAPTURE_INTERVAL_MS = 30_000;
export const CAPTURE_WIDTH = 480;
const JPEG_QUALITY = 0.7;

// 캡처에서 온 미리보기를 transform 없이 그대로 그린다.
// 미리보기의 전면 카메라 좌우 반전은 CSS로만 하므로, 이것은 시청자가 보는
// 반전되지 않은 프레임이다. 영상에 프레임이 생기기 전에는 null이다.
export function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = CAPTURE_WIDTH;
  canvas.height = Math.round((CAPTURE_WIDTH * videoHeight) / videoWidth);
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
  });
}

function uploadThumbnail(broadcastId: string, image: Blob): Promise<void> {
  const body = new FormData();
  body.append('image', image, 'thumbnail.jpg');
  return apiFetch(`/broadcasts/${broadcastId}/thumbnail`, {
    method: 'PUT',
    body,
  });
}

// `enabled`인 동안 미리보기 프레임을 바로 올리고, 이후
// 30 s마다 올린다. 썸네일은 있으면 좋은 정도라서, 실패하면 다음 차례를 기다리고
// 송출 세션이나 페이지에는 알리지 않는다.
export function useThumbnailCapture(
  broadcastId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const tick = async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        const image = await captureFrame(video);
        if (image && !stopped) await uploadThumbnail(broadcastId, image);
      } catch {
        // 다음 차례에 다시 시도한다.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), CAPTURE_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [broadcastId, videoRef, enabled]);
}
