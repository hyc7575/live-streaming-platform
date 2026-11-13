import { expect, test, type Page } from '@playwright/test';
import { emulatePhoneCameras, PHONE } from '../e2e/phone';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  statusOf,
  watchUntilPlaying,
} from './support';

test.use({
  ...PHONE,
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream=device-count=2',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

const REAR = { width: 1280, height: 720 };

interface Probe {
  peerConnections: RTCPeerConnection[];
  clones: MediaStreamTrack[];
  liveFrontWhenRearOpened: number | null;
}

// emulatePhoneCameras 뒤에 실행한다. 후면 카메라는 다른 크기로 열려 전환하면
// 송출 해상도도 바뀐다. 각 clone을 남겨 두어, 보내던 전면 카메라를
// 후면 카메라를 열기 전에 놓았는지 테스트가
// 확인할 수 있게 한다.
function recordPublish(rear: typeof REAR) {
  const probe = window as unknown as Probe & Window;
  probe.peerConnections = [];
  probe.clones = [];
  probe.liveFrontWhenRearOpened = null;
  const Original = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends Original {
    constructor(config?: RTCConfiguration) {
      super(config);
      probe.peerConnections.push(this);
    }
  };
  const clone = Object.getOwnPropertyDescriptor(
    MediaStreamTrack.prototype,
    'clone',
  )?.value as (this: MediaStreamTrack) => MediaStreamTrack;
  MediaStreamTrack.prototype.clone = function (this: MediaStreamTrack) {
    const copy = clone.call(this);
    probe.clones.push(copy);
    return copy;
  };
  const media = navigator.mediaDevices;
  const getUserMedia = media.getUserMedia.bind(media);
  media.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const video = constraints?.video;
    const wantsRear =
      typeof video === 'object' &&
      JSON.stringify(video.facingMode ?? '').includes('environment');
    if (wantsRear) {
      probe.liveFrontWhenRearOpened = [
        ...probe.acquiredTracks,
        ...probe.clones,
      ].filter(
        (t) => t.label === 'fake_device_0' && t.readyState === 'live',
      ).length;
    }
    const stream = await getUserMedia(constraints);
    if (wantsRear) await stream.getVideoTracks()[0].applyConstraints(rear);
    return stream;
  };
}

function sentVideo(page: Page) {
  return page.evaluate(() => {
    const probe = window as unknown as Probe;
    const track = probe.peerConnections
      .at(-1)
      ?.getSenders()
      .find((s) => s.track?.kind === 'video')?.track;
    return track
      ? {
          label: track.label,
          readyState: track.readyState,
          width: track.getSettings().width,
        }
      : null;
  });
}

function playback(viewer: Page) {
  return viewer.getByLabel('방송 화면').evaluate((v: HTMLVideoElement) => ({
    time: v.currentTime,
    width: v.videoWidth,
    height: v.videoHeight,
  }));
}

test('a phone camera publish survives switching cameras and a minute untouched', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '모바일 송출');
  await page.addInitScript(emulatePhoneCameras);
  await page.addInitScript(recordPublish, REAR);
  await page.goto(`/studio/broadcasts/${id}`);

  await test.step('turn on the front camera and go live', async () => {
    await expect(page.getByRole('button', { name: '화면 공유' })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: '카메라 켜기' }).click();
    await page.getByRole('button', { name: '방송 시작' }).click();
    await expect(page.getByText('송출 중입니다.')).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() => statusOf(page.request, id), { timeout: 10_000 })
      .toBe('LIVE');
    expect((await sentVideo(page))?.label).toBe('fake_device_0');
    await screenshot(page, 'mobile-publish-front');
  });

  const viewerContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);
  const before = await playback(viewer);
  expect(before.width).toBe(640);

  await test.step('switch to the rear camera while live', async () => {
    await page.getByRole('button', { name: '후면 카메라로 전환' }).click();
    await expect(
      page.getByRole('button', { name: '전면 카메라로 전환' }),
    ).toBeVisible();
    await expect
      .poll(async () => (await sentVideo(page))?.label)
      .toBe('fake_device_1');
    const sent = await sentVideo(page);
    expect(sent).toEqual({
      label: 'fake_device_1',
      readyState: 'live',
      width: REAR.width,
    });
    expect(
      await page.evaluate(
        () => (window as unknown as Probe).liveFrontWhenRearOpened,
      ),
      'no front camera track, sent clone included, is live when the rear opens',
    ).toBe(0);
    await expect(page.getByText('송출 중입니다.')).toBeVisible();
    await expect(
      page.getByText('후면 카메라 ·', { exact: false }),
    ).toBeVisible();
    await screenshot(page, 'mobile-publish-rear');
  });

  await test.step('the viewer keeps playing at the new resolution', async () => {
    await expect
      .poll(async () => (await playback(viewer)).width, {
        message: 'hls.js switches to the rear camera size',
        timeout: 30_000,
      })
      .toBe(REAR.width);
    const after = await playback(viewer);
    expect(after.height).toBe(REAR.height);
    await expect
      .poll(async () => (await playback(viewer)).time, {
        message: 'the viewer keeps playing after the switch',
        timeout: 20_000,
      })
      .toBeGreaterThan(after.time + 2);
    await expect(viewer.getByText('방송이 끝났습니다.')).toHaveCount(0);
    await screenshot(viewer, 'viewer-after-switch');
  });

  await test.step('switch back to the front camera', async () => {
    await page.getByRole('button', { name: '전면 카메라로 전환' }).click();
    await expect
      .poll(async () => (await sentVideo(page))?.label)
      .toBe('fake_device_0');
    await expect
      .poll(async () => (await playback(viewer)).width, { timeout: 30_000 })
      .toBe(640);
  });

  await test.step('a minute untouched keeps the publish and the screen on', async () => {
    const start = await playback(viewer);
    await page.waitForTimeout(60_000);
    await expect(page.getByText('송출 중입니다.')).toBeVisible();
    expect(await statusOf(page.request, id)).toBe('LIVE');
    expect(
      await page.evaluate(() => window.wakeLocks.map((s) => s.released)),
    ).toEqual([false]);
    expect((await playback(viewer)).time).toBeGreaterThan(start.time + 50);
  });

  await test.step('end releases every camera track', async () => {
    await page.getByRole('button', { name: '방송 종료' }).click();
    await page.getByRole('button', { name: '종료하기' }).click();
    await expect(
      page.getByText('방송을 종료했습니다.', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    const states = await page.evaluate(() => {
      const probe = window as unknown as Probe & Window;
      return [...probe.acquiredTracks, ...probe.clones].map(
        (t) => t.readyState,
      );
    });
    expect(new Set(states)).toEqual(new Set(['ended']));
    await expect(viewer.getByText('방송이 끝났습니다.')).toBeVisible({
      timeout: 15_000,
    });
  });

  await viewerContext.close();
});
