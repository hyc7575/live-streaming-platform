import { expect, test } from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  statusOf,
  watchUntilPlaying,
} from './support';

test('a published camera reaches an anonymous viewer over LL-HLS', async ({
  page,
  browser,
}) => {
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '송출에서 시청까지');

  await page.goto(`/studio/broadcasts/${id}`);
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => statusOf(page.request, id), { timeout: 10_000 })
    .toBe('LIVE');
  await screenshot(page, 'publish-live');

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  const video = viewer.getByLabel('방송 화면');
  // 첫 프레임은 송출이 연결되고 약 11초 뒤에 온다(#102).
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 60_000,
    })
    .toBeGreaterThan(1);
  const playback = await video.evaluate((v: HTMLVideoElement) => ({
    width: v.videoWidth,
    height: v.videoHeight,
    start: v.currentTime,
    src: v.src,
  }));
  // hls.js는 MediaSource로 재생하므로 요소에는 blob: URL이 들어 있다.
  expect(playback.src).toMatch(/^blob:/);
  expect(playback.width).toBeGreaterThan(0);
  expect(playback.height).toBeGreaterThan(0);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(playback.start + 1);
  await expect(viewer.getByText('방송을 불러오는 중입니다')).toBeHidden();
  await screenshot(viewer, 'viewer-playing');
  await viewerContext.close();

  const second = await createBroadcast(page.request, '두 번째 방송');
  const secondPage = await page.context().newPage();
  await secondPage.goto(`/studio/broadcasts/${second}`);
  await secondPage.getByRole('button', { name: '카메라 켜기' }).click();
  await secondPage.getByRole('button', { name: '방송 시작' }).click();
  await expect(secondPage.getByRole('alert')).toHaveText(
    '기존 방송을 종료하세요.',
  );
  await secondPage.close();

  await page.getByRole('button', { name: '방송 종료' }).click();
  await page.getByRole('button', { name: '종료하기' }).click();
  await expect(page.getByText('방송을 종료했습니다.')).toBeVisible();
});

interface TrackProbe {
  __clones: MediaStreamTrack[];
  __preview: MediaStreamTrack[];
}

test('ending stops every track, tells the viewer, and refuses a republish', async ({
  page,
  browser,
}) => {
  await page.addInitScript(() => {
    const probe = window as unknown as TrackProbe;
    probe.__clones = [];
    const proto = MediaStreamTrack.prototype;
    const clone = Object.getOwnPropertyDescriptor(proto, 'clone')?.value as (
      this: MediaStreamTrack,
    ) => MediaStreamTrack;
    proto.clone = function (this: MediaStreamTrack) {
      const copy = clone.call(this);
      probe.__clones.push(copy);
      return copy;
    };
  });
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '종료 확인');

  await page.goto(`/studio/broadcasts/${id}`);
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);

  const issued = await page.request.post(`/api/broadcasts/${id}/publish-token`);
  expect(issued.status(), await issued.text()).toBe(201);
  const { publishUrl } = (await issued.json()) as { publishUrl: string };
  const token = new URL(publishUrl, 'http://x').searchParams.get('token');
  expect(token).toBeTruthy();

  await page.getByLabel('미리보기').evaluate((v: HTMLVideoElement) => {
    const probe = window as unknown as TrackProbe;
    probe.__preview = (v.srcObject as MediaStream).getTracks();
  });
  expect(
    await page.evaluate(
      () => (window as unknown as TrackProbe).__clones.length,
    ),
  ).toBeGreaterThan(0);

  await page.getByRole('button', { name: '방송 종료' }).click();
  await page.getByRole('button', { name: '종료하기' }).click();
  const endedAt = Date.now();

  await expect(viewer.getByText('방송이 끝났습니다.')).toBeVisible({
    timeout: 10_000,
  });
  expect(Date.now() - endedAt).toBeLessThan(10_000);
  await expect(viewer.getByLabel('방송 화면')).toHaveCount(0);
  await screenshot(viewer, 'viewer-ended');
  await viewerContext.close();

  await expect(page.getByText('방송을 종료했습니다.')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = window as unknown as TrackProbe;
        return [...probe.__preview, ...probe.__clones].map(
          (track) => track.readyState,
        );
      }),
    )
    .toEqual(expect.not.arrayContaining(['live']));
  await screenshot(page, 'publish-ended');
  expect(await statusOf(page.request, id)).toBe('ENDED');

  const republish = await page.request.post(
    `/app/${id}?direction=whip&transport=all&token=${token}`,
    { headers: { 'Content-Type': 'application/sdp' }, data: 'v=0\r\n' },
  );
  expect(republish.status()).toBe(401);
  const reissue = await page.request.post(
    `/api/broadcasts/${id}/publish-token`,
  );
  expect(reissue.status()).toBe(409);
});

test('the streamer ends from the detail page while another tab publishes', async ({
  page,
}) => {
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '상세에서 종료');

  await page.goto(`/studio/broadcasts/${id}`);
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });

  const detail = await page.context().newPage();
  await detail.goto(`/broadcasts/${id}`);
  await detail.getByRole('button', { name: '방송 종료' }).click();
  await screenshot(detail, 'detail-end-confirm');
  await detail.getByRole('button', { name: '종료하기' }).click();
  await expect(detail.getByText('방송이 끝났습니다.')).toBeVisible();
  expect(await statusOf(page.request, id)).toBe('ENDED');

  await expect(page.getByText('방송이 종료되었습니다.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel('미리보기')).toHaveCount(0);
  await screenshot(page, 'publish-ended-elsewhere');
});

test('OME refuses a publish without a valid token', async ({ page }) => {
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '거절 확인');
  const other = await createBroadcast(page.request, '다른 방송');
  const issued = await page.request.post(
    `/api/broadcasts/${other}/publish-token`,
  );
  expect(issued.status()).toBe(201);
  const { publishUrl } = (await issued.json()) as { publishUrl: string };
  const otherToken = new URL(publishUrl, 'http://x').searchParams.get('token');

  for (const token of [null, 'not-a-real-token', otherToken]) {
    const query = token ? `&token=${token}` : '';
    const res = await page.request.post(
      `/app/${id}?direction=whip&transport=all${query}`,
      {
        headers: { 'Content-Type': 'application/sdp' },
        data: 'v=0\r\n',
      },
    );
    expect(res.status(), `token=${token}`).toBe(401);
  }
  expect(await statusOf(page.request, id)).toBe('READY');
  expect(await statusOf(page.request, other)).toBe('READY');
});
