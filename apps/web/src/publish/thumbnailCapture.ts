import { useEffect, type RefObject } from 'react';
import { apiFetch } from '../api';

export const CAPTURE_INTERVAL_MS = 30_000;
export const CAPTURE_WIDTH = 480;
const JPEG_QUALITY = 0.7;

// Draws the preview as it arrives from the capture, with no transform. The
// front-camera mirror on the preview is CSS only, so this is the unmirrored
// frame viewers see. Null until the video has a frame.
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

// While `enabled`, uploads a frame of the preview right away and then every
// 30 s. A thumbnail is a nicety: any failure waits for the next tick and
// never reaches the publish session or the page.
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
        // The next tick tries again.
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
