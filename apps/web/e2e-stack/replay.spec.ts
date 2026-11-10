import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  startPublishing,
} from './support';

interface Replay {
  id: string;
  title: string;
  recordingFiles: string[];
}

// The reconciler settles finished files every 30 s, so a replay shows up
// within one interval plus the time OME takes to finalize the file.
const SETTLE_MS = 75_000;

async function replays(request: APIRequestContext): Promise<Replay[]> {
  const res = await request.get('/api/replays');
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Replay[];
}

async function endBroadcast(request: APIRequestContext, id: string) {
  const res = await request.post(`/api/broadcasts/${id}/end`);
  expect(res.status(), await res.text()).toBe(200);
}

test('an ended broadcast is listed as a replay and plays every part', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const api = page.context().request;
  await signUpAndLogIn(api);
  const title = `다시보기 ${Date.now()}`;
  const id = await createBroadcast(api, title);

  await startPublishing(page, id);
  await page.waitForTimeout(8000);
  // A reload within the grace period reconnects the same broadcast. OME
  // keeps the recording task and writes the second connection to a new file.
  await page.reload();
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(8000);
  const endedAt = Date.now();
  await endBroadcast(api, id);

  let replay: Replay | undefined;
  await expect
    .poll(
      async () => {
        replay = (await replays(api)).find((r) => r.id === id);
        return replay?.recordingFiles.length ?? 0;
      },
      { timeout: SETTLE_MS, intervals: [2000] },
    )
    .toBe(2);
  console.log(
    `end → listed as a replay in ${((Date.now() - endedAt) / 1000).toFixed(1)} s: ${replay?.recordingFiles.join(', ')}`,
  );

  const [first, second] = replay?.recordingFiles ?? [];
  for (const file of [first, second]) {
    const whole = await api.get(`/recordings/${file}`);
    expect(whole.status()).toBe(200);
    expect(whole.headers()['content-type']).toBe('video/mp4');
    const range = await api.get(`/recordings/${file}`, {
      headers: { Range: 'bytes=0-99' },
    });
    expect(range.status()).toBe(206);
  }

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto('/?status=REPLAY');
  await viewer.getByRole('link', { name: new RegExp(title) }).click();
  const video = viewer.getByLabel('다시보기 화면');
  await expect(video).toHaveAttribute('src', `/recordings/${first}`);
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 15_000,
    })
    .toBeGreaterThan(1);
  const size = await video.evaluate((v: HTMLVideoElement) => [
    v.videoWidth,
    v.duration,
  ]);
  console.log(`part 1 plays: width ${size[0]}, duration ${size[1]} s`);
  expect(size[0]).toBeGreaterThan(0);
  await screenshot(viewer, 'replay-playing');

  // Seeking near the end lets the player advance to part 2 on its own.
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = Math.max(0, v.duration - 0.5);
  });
  await expect(video).toHaveAttribute('src', `/recordings/${second}`, {
    timeout: 15_000,
  });
  await expect(viewer.getByRole('button', { name: '2부' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 15_000,
    })
    .toBeGreaterThan(1);
  await viewerContext.close();
});

test('a broadcast that never sent media is not listed as a replay', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const api = page.context().request;
  await signUpAndLogIn(api);
  const title = `녹화 없음 ${Date.now()}`;
  const id = await createBroadcast(api, title);

  // The admission webhook admits the token and the broadcast goes LIVE, but
  // OME gets no usable offer, so no stream and no file ever exist.
  const ticket = await api.post(`/api/broadcasts/${id}/publish-token`);
  expect(ticket.status(), await ticket.text()).toBe(201);
  const { publishUrl } = (await ticket.json()) as { publishUrl: string };
  const whip = await api.post(publishUrl, {
    headers: { 'Content-Type': 'application/sdp' },
    data: 'v=0\r\n',
  });
  console.log(`WHIP with an unusable offer → ${whip.status()}`);
  const detail = await api.get(`/api/broadcasts/${id}`);
  const { status } = (await detail.json()) as { status: string };
  console.log(`broadcast after the WHIP request: ${status}`);
  if (status === 'LIVE') await endBroadcast(api, id);

  // One full reconcile interval after the end, with nothing to settle.
  await page.waitForTimeout(40_000);
  expect((await replays(api)).map((r) => r.id)).not.toContain(id);
  await page.goto('/?status=REPLAY');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(
    0,
  );
});
