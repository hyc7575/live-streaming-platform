import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  startPublishing,
  watchUntilPlaying,
} from './support';
import { installWallClockCamera, seekTo, wallClockOf } from './wallClock';

interface Part {
  file: string;
  startedAt: string | null;
}

// Issue #92 asks for chat within ±3 s of the moment the viewer saw.
const TOLERANCE_MS = 3000;
const NEAR_LIVE_MS = 6000;

async function holdUntilRecorded(api: APIRequestContext, id: string) {
  await expect
    .poll(async () => (await api.get(`/app/${id}/llhls.m3u8`)).status(), {
      timeout: 60_000,
      intervals: [1000],
    })
    .toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 8000));
}

async function postChat(api: APIRequestContext, id: string, body: string) {
  const res = await api.post(`/api/broadcasts/${id}/chat`, { data: { body } });
  expect(res.status(), await res.text()).toBe(201);
  return Date.parse(((await res.json()) as { createdAt: string }).createdAt);
}

// Watches the live broadcast, notes the capture time of the frame on screen
// and sends a chat about it, as a viewer reacting to what they see.
async function chatAboutWhatIsOnScreen(viewer: Page, id: string, body: string) {
  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);
  const live = viewer.getByLabel('방송 화면');
  // Right after a reconnect the player can sit on old segments for a while.
  // The rule under test assumes a viewer near the live edge, so wait for one.
  const watchingFrom = Date.now();
  await expect
    .poll(async () => Date.now() - ((await wallClockOf(live)) ?? 0), {
      timeout: 60_000,
      intervals: [1000],
    })
    .toBeLessThan(NEAR_LIVE_MS);
  console.log(
    `${body}: player reached the live edge ${Date.now() - watchingFrom} ms after playing`,
  );
  const seen = await wallClockOf(live);
  expect(seen, 'the live frame decodes').not.toBeNull();
  const createdAt = await postChat(viewer.context().request, id, body);
  console.log(
    `${body}: viewer was ${createdAt - seen!} ms behind the camera when sending`,
  );
  return seen!;
}

async function shown(log: Locator, body: string) {
  return (await log.getByText(body, { exact: true }).count()) > 0;
}

// The first position in the current part at which `body` is listed, to
// 0.1 s. Shown chat only grows as the playhead moves forward.
async function firstShownAt(video: Locator, log: Locator, body: string) {
  let lo = 0;
  let hi = await video.evaluate(
    (v: HTMLVideoElement) =>
      new Promise<number>((resolve) => {
        if (Number.isFinite(v.duration)) resolve(v.duration);
        else
          v.addEventListener('loadedmetadata', () => resolve(v.duration), {
            once: true,
          });
      }),
  );
  await seekTo(video, hi);
  expect(await shown(log, body), `${body} is shown by the part's end`).toBe(
    true,
  );
  while (hi - lo > 0.1) {
    const mid = (lo + hi) / 2;
    await seekTo(video, mid);
    if (await shown(log, body)) hi = mid;
    else lo = mid;
  }
  await seekTo(video, hi);
  return hi;
}

test('replay chat appears where the viewer saw it, in both parts', async ({
  page,
  browser,
}) => {
  test.setTimeout(420_000);
  await installWallClockCamera(page);
  const api = page.context().request;
  await signUpAndLogIn(api, '방송인');
  const id = await createBroadcast(api, `채팅 동기화 ${Date.now()}`);

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await signUpAndLogIn(viewerContext.request, '시청자');
  await postChat(viewerContext.request, id, '준비 중 채팅');

  await startPublishing(page, id);
  await holdUntilRecorded(api, id);
  const seen1 = await chatAboutWhatIsOnScreen(viewer, id, '1부 채팅');
  await page.waitForTimeout(3000);

  await page.reload();
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });
  await holdUntilRecorded(api, id);
  const seen2 = await chatAboutWhatIsOnScreen(viewer, id, '2부 채팅');
  await page.waitForTimeout(3000);
  expect((await api.post(`/api/broadcasts/${id}/end`)).status()).toBe(200);

  let parts: Part[] = [];
  await expect
    .poll(
      async () => {
        const res = await api.get(`/api/broadcasts/${id}`);
        parts = ((await res.json()) as { recordingParts: Part[] })
          .recordingParts;
        return parts.filter((p) => p.startedAt).length;
      },
      { timeout: 90_000, intervals: [2000] },
    )
    .toBe(2);
  console.log(`parts: ${JSON.stringify(parts)}`);

  await viewer.goto(`/broadcasts/${id}`);
  await viewer.getByRole('tab', { name: '채팅 기록' }).click();
  const log = viewer.getByRole('tabpanel', { name: '채팅 기록' });
  const video = viewer.getByLabel('다시보기 화면');
  for (const body of ['준비 중 채팅', '1부 채팅', '2부 채팅']) {
    await expect(log.getByText(body, { exact: true })).toBeVisible();
  }

  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(1);
  await expect(log.getByText('준비 중 채팅', { exact: true })).toBeVisible();
  expect(await shown(log, '2부 채팅')).toBe(false);

  const at1 = await firstShownAt(video, log, '1부 채팅');
  const error1 = (await wallClockOf(video))! - seen1;
  console.log(`1부 채팅 listed from ${at1.toFixed(1)} s: ${error1} ms off`);
  await seekTo(video, Math.max(0, at1 - 1));
  await expect(log.getByText('1부 채팅', { exact: true })).toHaveCount(0);
  await expect(log.getByText('준비 중 채팅', { exact: true })).toBeVisible();
  await screenshot(viewer, 'replay-chat-start');

  await viewer.getByRole('button', { name: '2부' }).click();
  await expect(video).toHaveAttribute('src', `/recordings/${parts[1].file}`);
  await expect(log.getByText('1부 채팅', { exact: true })).toBeVisible();
  const at2 = await firstShownAt(video, log, '2부 채팅');
  const error2 = (await wallClockOf(video))! - seen2;
  console.log(`2부 채팅 listed from ${at2.toFixed(1)} s: ${error2} ms off`);
  await screenshot(viewer, 'replay-chat-seeked');

  await seekTo(video, Math.max(0, at2 - 1));
  await expect(log.getByText('2부 채팅', { exact: true })).toHaveCount(0);

  expect(Math.abs(error1)).toBeLessThanOrEqual(TOLERANCE_MS);
  expect(Math.abs(error2)).toBeLessThanOrEqual(TOLERANCE_MS);
  await viewerContext.close();
});
