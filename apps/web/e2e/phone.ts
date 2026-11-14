import { devices, type Page } from '@playwright/test';
import { mockPublishApi, PUBLISH_PAGE } from './publishPage';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

declare global {
  interface Window {
    acquiredTracks: MediaStreamTrack[];
    wakeLocks: WakeLockSentinel[];
    previewStream: MediaStream;
  }
}

// Chrome의 가짜 카메라는 facingMode를 알리지 않으므로 이 코드가 휴대폰을 대신한다.
// fake_device_0이 전면 카메라, fake_device_1이 후면 카메라다.
export function emulatePhoneCameras() {
  window.acquiredTracks = [];
  window.wakeLocks = [];
  const media = navigator.mediaDevices;
  const getUserMedia = media.getUserMedia.bind(media);
  media.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const video = constraints?.video;
    if (video && typeof video === 'object' && video.facingMode) {
      const facing = video.facingMode;
      const exact = typeof facing === 'object' && 'exact' in facing;
      const wanted =
        typeof facing === 'string'
          ? facing
          : ((facing as ConstrainDOMStringParameters).exact ??
            (facing as ConstrainDOMStringParameters).ideal);
      const label =
        wanted === 'environment' ? 'fake_device_1' : 'fake_device_0';
      const camera = (await media.enumerateDevices()).find(
        (d) => d.kind === 'videoinput' && d.label === label,
      );
      if (!camera && exact) {
        throw new DOMException('no such camera', 'OverconstrainedError');
      }
      constraints = {
        ...constraints,
        video: camera ? { deviceId: { exact: camera.deviceId } } : true,
      };
    }
    const stream = await getUserMedia(constraints);
    window.acquiredTracks.push(...stream.getTracks());
    return stream;
  };
  if ('wakeLock' in navigator) {
    const request = navigator.wakeLock.request.bind(navigator.wakeLock);
    navigator.wakeLock.request = async (type) => {
      const sentinel = await request(type);
      window.wakeLocks.push(sentinel);
      return sentinel;
    };
  }
}

export async function openPreview(page: Page) {
  await mockPublishApi(page.context());
  await page.addInitScript(emulatePhoneCameras);
  await page.goto(PUBLISH_PAGE);
  await page.getByRole('button', { name: '카메라 켜기' }).click();
}

export async function shoot(page: Page, name: string) {
  if (SCREENSHOT_DIR) {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
  }
}

export const PHONE = {
  ...devices['Pixel 7'],
  permissions: ['camera', 'microphone', 'screen-wake-lock'],
};
