import { expect, test, type Browser, type Page } from '@playwright/test';
import { emulatePhoneCameras, PHONE } from '../e2e/phone';
import { TONE_TAB_TITLE } from '../playwright.config';
import {
  createBroadcast,
  detailOf,
  screenshot,
  signUpAndLogIn,
  watchUntilPlaying,
} from './support';

// One launch for both sources: tab capture picked by title for the screen
// share (as in pcPublish.spec.ts), and granted camera permission for the
// camera.
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      `--auto-select-tab-capture-source-by-title=${TONE_TAB_TITLE}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
  permissions: ['camera', 'microphone'],
});

// How long the viewer must keep playing while captures run. The issue's
// check is 5 minutes: THUMBNAIL_SOAK_MS=300000.
const SOAK_MS = Number(process.env.THUMBNAIL_SOAK_MS || 65_000);
const CAPTURE_INTERVAL_MS = 30_000;
const LIST_REFRESH_MS = 30_000;

// The tab the screen share captures, as in pcPublish.spec.ts.
const TONE_PAGE = `<!doctype html><title>${TONE_TAB_TITLE}</title>
<p>440Hz</p>
<script>
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.connect(ctx.destination);
  osc.start();
</script>`;

function cardImage(list: Page, id: string) {
  return list.locator(`a[href="/broadcasts/${id}"] img`);
}

function loadedImage(list: Page, id: string) {
  return cardImage(list, id).evaluate((img: HTMLImageElement) => ({
    src: img.getAttribute('src'),
    complete: img.complete,
    naturalWidth: img.naturalWidth,
  }));
}

async function expectLoaded(list: Page, id: string, src?: string | null) {
  await expect
    .poll(() => loadedImage(list, id), { timeout: 10_000 })
    .toMatchObject({
      complete: true,
      naturalWidth: 480,
      ...(src ? { src } : {}),
    });
}

// Samples the viewer once a second for `ms`, failing on any 5 s stretch
// with under 3 s of playback, or any moment the publish page is not live.
async function soak(publisher: Page, viewer: Page, ms: number) {
  const video = viewer.getByLabel('방송 화면');
  const live = publisher.getByText('송출 중입니다.');
  const times: number[] = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    times.push(await video.evaluate((v: HTMLVideoElement) => v.currentTime));
    expect(await live.isVisible(), 'the publish page stays live').toBe(true);
    const i = times.length - 1;
    if (i >= 5) {
      expect(
        times[i] - times[i - 5],
        `viewer playback over the 5 s ending at sample ${i}`,
      ).toBeGreaterThanOrEqual(3);
    }
    await viewer.waitForTimeout(1_000);
  }
}

async function checkThumbnails(browser: Browser, publisher: Page, id: string) {
  await expect
    .poll(async () => (await detailOf(publisher.request, id)).thumbnailUrl, {
      message: 'the first capture is uploaded right after going live',
      timeout: 10_000,
    })
    .not.toBeNull();

  const viewerContext = await browser.newContext();
  const list = await viewerContext.newPage();
  const watcher = await viewerContext.newPage();

  await test.step('the LIVE card shows the captured frame', async () => {
    await list.goto('/');
    await expectLoaded(list, id);
    const { src } = await loadedImage(list, id);
    const served = await list.request.get(src!);
    expect(served.headers()['x-content-type-options']).toBe('nosniff');
    await screenshot(list, 'thumbnail-live-card');
  });

  await test.step('the card follows the next capture', async () => {
    const { src: first } = await loadedImage(list, id);
    await expect
      .poll(async () => (await loadedImage(list, id)).src, {
        timeout: CAPTURE_INTERVAL_MS + LIST_REFRESH_MS + 15_000,
      })
      .not.toBe(first);
    await expectLoaded(list, id);
  });

  await test.step(`capturing does not disturb the broadcast for ${SOAK_MS / 1000} s`, async () => {
    await watcher.goto(`/broadcasts/${id}`);
    await watchUntilPlaying(watcher);
    await soak(publisher, watcher, SOAK_MS);
  });

  await test.step('the ENDED card keeps the last frame', async () => {
    await publisher.bringToFront();
    await publisher.getByRole('button', { name: '방송 종료' }).click();
    await publisher.getByRole('button', { name: '종료하기' }).click();
    await expect(publisher.getByText('방송을 종료했습니다.')).toBeVisible({
      timeout: 10_000,
    });
    const ended = await detailOf(publisher.request, id);
    expect(ended.status).toBe('ENDED');
    expect(ended.thumbnailUrl).not.toBeNull();
    await list.goto('/?status=ENDED');
    await expectLoaded(list, id, ended.thumbnailUrl);
    await screenshot(list, 'thumbnail-ended-card');
  });

  await viewerContext.close();
}

test('a shared screen becomes the card thumbnail and keeps it after the end', async ({
  context,
  page,
  browser,
}) => {
  test.setTimeout(SOAK_MS + 240_000);
  await context.route('**/e2e-tone', (route) =>
    route.fulfill({ contentType: 'text/html', body: TONE_PAGE }),
  );
  const tone = await context.newPage();
  await tone.goto('/e2e-tone');
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '썸네일 화면 공유');
  await page.goto(`/studio/broadcasts/${id}`);

  // The tab opened last holds focus, and getDisplayMedia from an unfocused
  // document rejects. Chrome then focuses the captured tab.
  await page.bringToFront();
  await page.getByRole('button', { name: '화면 공유' }).click();
  await expect(page.getByRole('button', { name: '방송 시작' })).toBeVisible();
  await page.bringToFront();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });

  await checkThumbnails(browser, page, id);
});

test.describe('camera', () => {
  // Everything of PHONE but Pixel 7's browser type, which is per worker and
  // cannot change inside a file.
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = PHONE;
  test.use({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    permissions: PHONE.permissions,
  });

  test('a phone camera becomes the card thumbnail and keeps it after the end', async ({
    page,
    browser,
  }) => {
    test.setTimeout(SOAK_MS + 240_000);
    await signUpAndLogIn(page.request);
    const id = await createBroadcast(page.request, '썸네일 카메라');
    await page.addInitScript(emulatePhoneCameras);
    await page.goto(`/studio/broadcasts/${id}`);
    await page.getByRole('button', { name: '카메라 켜기' }).click();
    await page.getByRole('button', { name: '방송 시작' }).click();
    await expect(page.getByText('송출 중입니다.')).toBeVisible({
      timeout: 30_000,
    });

    await checkThumbnails(browser, page, id);
  });
});
