import { expect, test, type Page } from '@playwright/test';
import { openPreview, PHONE, shoot } from './phone';
import { mockPublishApi, PUBLISH_PAGE } from './publishPage';

function previewTracks(page: Page) {
  return page.evaluate(() => {
    const stream = document.querySelector('video')!.srcObject as MediaStream;
    return {
      sameStream: stream === window.previewStream,
      audio: stream.getAudioTracks().map((t) => t.id),
      video: stream.getVideoTracks().map((t) => t.label),
    };
  });
}

test.use({
  ...PHONE,
  launchOptions: {
    args: ['--use-fake-device-for-media-stream=device-count=2'],
  },
});

test('switches cameras inside one stream and keeps the screen on', async ({
  page,
}) => {
  await openPreview(page);
  const toRear = page.getByRole('button', { name: '후면 카메라로 전환' });
  await expect(toRear).toBeVisible();
  await expect(page.getByText(/화면 꺼짐 방지가 켜져 있습니다/)).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByLabel('미리보기')
        .evaluate((v: HTMLVideoElement) => v.videoWidth),
    )
    .toBeGreaterThan(0);

  await page.evaluate(() => {
    window.previewStream = document.querySelector('video')!
      .srcObject as MediaStream;
  });
  const before = await previewTracks(page);
  expect(before.video).toEqual(['fake_device_0']);
  expect(before.audio).toHaveLength(1);
  await shoot(page, 'mobile-front');

  await toRear.click();
  await expect(
    page.getByRole('button', { name: '전면 카메라로 전환' }),
  ).toBeVisible();
  const afterRear = await previewTracks(page);
  expect(afterRear).toEqual({
    sameStream: true,
    audio: before.audio,
    video: ['fake_device_1'],
  });
  expect(
    await page.evaluate(() =>
      window.acquiredTracks
        .filter((t) => t.label === 'fake_device_0')
        .map((t) => t.readyState),
    ),
  ).toEqual(['ended']);
  await expect(page.getByLabel('미리보기')).toHaveAttribute(
    'data-mirrored',
    'false',
  );
  await shoot(page, 'mobile-rear');

  await page.getByRole('button', { name: '전면 카메라로 전환' }).click();
  await expect(toRear).toBeVisible();
  expect(await previewTracks(page)).toEqual({
    sameStream: true,
    audio: before.audio,
    video: ['fake_device_0'],
  });

  await page.getByRole('button', { name: '카메라 끄기' }).click();
  await expect(page.getByRole('button', { name: '카메라 켜기' })).toBeVisible();
  const leftovers = await page.evaluate(() => ({
    tracks: window.acquiredTracks.map((t) => t.readyState),
    wakeLocksReleased: window.wakeLocks.map((s) => s.released),
  }));
  expect(new Set(leftovers.tracks)).toEqual(new Set(['ended']));
  expect(leftovers.wakeLocksReleased).toEqual([true]);
});

test.describe('without the wake lock permission', () => {
  test.use({ permissions: ['camera', 'microphone'] });

  test('says the screen may turn off', async ({ page }) => {
    await openPreview(page);
    await expect(
      page.getByText(/화면 꺼짐 방지를 켜지 못했습니다/),
    ).toBeVisible();
  });
});

test('explains a browser without the Wake Lock API', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, 'wakeLock');
  });
  await openPreview(page);
  await expect(
    page.getByText(/이 브라우저는 화면 꺼짐 방지를 지원하지 않습니다/),
  ).toBeVisible();
});

test.describe('when camera permission is denied', () => {
  test.use({ permissions: [] });

  test('shows how to allow it again', async ({ page }) => {
    await openPreview(page);
    const guide = page.getByRole('alert');
    await expect(guide).toContainText('카메라·마이크 권한이 꺼져 있습니다');
    await expect(guide).toContainText('iPhone (Safari)');
    await expect(guide).toContainText('Android (Chrome)');
    await expect(
      page.getByRole('button', { name: '카메라 켜기' }),
    ).toBeVisible();
    await shoot(page, 'mobile-denied');
  });
});

test('tells a device without a camera apart from a denied permission', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('no camera', 'NotFoundError'));
  });
  await mockPublishApi(page.context());
  await page.goto(PUBLISH_PAGE);
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    '카메라나 마이크를 찾지 못했습니다.',
  );
});
