import { expect, test, type Page } from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  watchUntilPlaying,
} from './support';

const BITS = 30;
const CLOCK_WIDTH = 640;
const CLOCK_HEIGHT = 360;

// 가짜 카메라에는 시계가 없어, 송출자의 카메라를 Date.now()를 흑백 블록으로 쓰는
// canvas로 바꾼다. 송출자와 시청자가 이 기기의 시계를 함께 쓰므로,
// 시청자 쪽에서 프레임을 디코드하면 OCR 없이
// glass-to-glass 지연을 얻는다.
async function publishClock(page: Page) {
  await page.addInitScript(
    ({ bits, width, height }) => {
      const devices = navigator.mediaDevices;
      const original = devices.getUserMedia.bind(devices);
      devices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        const block = width / bits;
        setInterval(() => {
          const now = Date.now() % 2 ** bits;
          ctx.fillStyle = '#808080';
          ctx.fillRect(0, 0, width, height);
          for (let i = 0; i < bits; i += 1) {
            ctx.fillStyle = (now >> i) & 1 ? '#ffffff' : '#000000';
            ctx.fillRect(i * block, height / 3, block, height / 3);
          }
        }, 20);
        const [video] = canvas.captureStream(30).getVideoTracks();
        for (const track of stream.getVideoTracks()) {
          stream.removeTrack(track);
          track.stop();
        }
        if (video) stream.addTrack(video);
        return stream;
      };
    },
    { bits: BITS, width: CLOCK_WIDTH, height: CLOCK_HEIGHT },
  );
}

async function latencyMs(viewer: Page): Promise<number> {
  return viewer.getByLabel('방송 화면').evaluate(
    (video: HTMLVideoElement, { bits }) => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      const block = canvas.width / bits;
      let stamp = 0;
      for (let i = 0; i < bits; i += 1) {
        const [r] = ctx.getImageData(
          Math.floor(i * block + block / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data;
        if ((r ?? 0) > 128) stamp += 2 ** i;
      }
      const now = Date.now() % 2 ** bits;
      return (now - stamp + 2 ** bits) % 2 ** bits;
    },
    { bits: BITS },
  );
}

async function showControls(viewer: Page) {
  const box = await viewer.getByLabel('방송 화면').boundingBox();
  if (box) await viewer.mouse.move(box.x + box.width / 2, box.y + 20);
}

test('custom controls pause, fall behind, and catch up to live', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await publishClock(page);
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '플레이어 컨트롤 확인');
  await page.goto(`/studio/broadcasts/${id}`);
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });

  const pcContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const viewer = await pcContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);
  const video = viewer.getByLabel('방송 화면');
  expect(await video.getAttribute('controls')).toBeNull();
  await viewer.waitForTimeout(3000);
  const atStart = await latencyMs(viewer);
  console.log(`latency at start: ${atStart} ms`);

  await showControls(viewer);
  await expect(viewer.getByRole('button', { name: '일시정지' })).toBeVisible();
  await screenshot(viewer, 'player-pc-live');

  await viewer.getByRole('button', { name: '일시정지' }).click();
  await expect(
    viewer.getByRole('button', { name: '재생' }).first(),
  ).toBeVisible();
  await viewer.waitForTimeout(30_000);
  const behind = viewer.getByRole('button', { name: '라이브로 이동' });
  await expect(behind).toBeVisible();
  await screenshot(viewer, 'player-pc-paused-behind');

  await viewer.getByRole('button', { name: '재생' }).first().click();
  await viewer.waitForTimeout(3000);
  const resumed = await latencyMs(viewer);
  console.log(`latency after resume without catching up: ${resumed} ms`);
  expect(resumed).toBeGreaterThan(20_000);
  await showControls(viewer);
  await expect(behind).toBeVisible();

  await behind.click();
  await viewer.waitForTimeout(3000);
  const caughtUp = await latencyMs(viewer);
  console.log(`latency after 라이브로 이동: ${caughtUp} ms`);
  expect(caughtUp).toBeLessThanOrEqual(5000);
  await showControls(viewer);
  await expect(behind).toBeHidden();
  await screenshot(viewer, 'player-pc-caught-up');

  await viewer.mouse.move(0, 0);
  await viewer.waitForTimeout(4000);
  await screenshot(viewer, 'player-pc-idle');

  await video.evaluate((v: HTMLVideoElement) => {
    v.volume = 0.3;
  });
  await viewer.reload();
  await watchUntilPlaying(viewer);
  const restored = await video.evaluate((v: HTMLVideoElement) => ({
    volume: v.volume,
    muted: v.muted,
  }));
  expect(restored.volume).toBeCloseTo(0.3, 2);
  expect(restored.muted).toBe(false);
  await pcContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 360, height: 740 },
    hasTouch: true,
    isMobile: true,
  });
  const mobile = await mobileContext.newPage();
  await mobile.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(mobile);
  const mobileVideo = mobile.getByLabel('방송 화면');
  await mobile.waitForTimeout(4000);
  await mobileVideo.tap();
  expect(await mobileVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(
    false,
  );
  await expect(mobile.getByRole('button', { name: '일시정지' })).toBeVisible();
  await mobile.waitForTimeout(500);
  await screenshot(mobile, 'player-360-live');
  await mobileContext.close();

  const owner = await page.context().newPage();
  await owner.setViewportSize({ width: 1280, height: 800 });
  await owner.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(owner);
  const ownerVideo = owner.getByLabel('방송 화면');
  expect(await ownerVideo.evaluate((v: HTMLVideoElement) => v.muted)).toBe(
    true,
  );
  await expect(owner.getByRole('button', { name: '소리 켜기' })).toBeVisible();
  await showControls(owner);
  await screenshot(owner, 'player-pc-owner-muted');

  const chat = owner.getByLabel('채팅 쓰기');
  await chat.click();
  await chat.press('Space');
  await chat.press('m');
  expect(
    await ownerVideo.evaluate((v: HTMLVideoElement) => ({
      paused: v.paused,
      muted: v.muted,
    })),
  ).toEqual({ paused: false, muted: true });

  await owner.getByRole('button', { name: '소리 켜기' }).focus();
  await owner.keyboard.press('Enter');
  expect(await ownerVideo.evaluate((v: HTMLVideoElement) => v.muted)).toBe(
    false,
  );
  await expect(owner.getByRole('button', { name: '소리 켜기' })).toBeHidden();
  await owner.close();

  await page.getByRole('button', { name: '방송 종료' }).click();
  await page.getByRole('button', { name: '종료하기' }).click();
  await expect(page.getByText('방송을 종료했습니다.')).toBeVisible();
});
