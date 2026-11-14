import { expect, test } from '@playwright/test';
import {
  createBroadcast,
  detailOf,
  screenshot,
  signUpAndLogIn,
  startPublishing,
  statusOf,
  watchUntilPlaying,
} from './support';

// 실제 OME에서 PRD §7.4 비정상 종료를 확인한다(README "비정상 종료와 재접속
// 유예").
const GRACE_S = 30;
const CLOSING_S = 1;
const SWEEP_INTERVAL_S = 30;
const VIEWER_POLL_S = 5;
const SLACK_S = 9;
const ENDED_NOTICE_TIMEOUT_MS =
  (CLOSING_S + GRACE_S + SWEEP_INTERVAL_S + VIEWER_POLL_S + SLACK_S) * 1000;

test('a closed publish tab ends the broadcast after the grace period', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const api = page.context().request;
  await signUpAndLogIn(api);
  const id = await createBroadcast(api, '탭 닫기');
  await startPublishing(page, id);

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);

  await page.close({ runBeforeUnload: false });
  const closedAt = Date.now();

  await expect(viewer.getByText('방송이 끝났습니다.')).toBeVisible({
    timeout: ENDED_NOTICE_TIMEOUT_MS,
  });
  const seconds = (Date.now() - closedAt) / 1000;
  console.log(`tab closed → viewer saw the end in ${seconds.toFixed(1)} s`);
  expect(seconds).toBeGreaterThanOrEqual(GRACE_S);
  await screenshot(viewer, 'viewer-ended-after-grace');
  const detail = await detailOf(api, id);
  expect(detail.status).toBe('ENDED');
  expect(detail.endedAt).not.toBeNull();
  await viewerContext.close();
});

test('a reload within the grace period keeps the same broadcast LIVE', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const api = page.context().request;
  await signUpAndLogIn(api);
  const id = await createBroadcast(api, '새로고침');
  await startPublishing(page, id);
  const { startedAt } = await detailOf(api, id);

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);
  const video = viewer.getByLabel('방송 화면');

  const reloadedAt = Date.now();
  const timeAtReload = await video.evaluate(
    (v: HTMLVideoElement) => v.currentTime,
  );
  await page.reload();
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });
  const seconds = (Date.now() - reloadedAt) / 1000;
  console.log(`reload → publishing again in ${seconds.toFixed(1)} s`);
  expect(seconds).toBeLessThan(GRACE_S);

  for (let i = 0; i < 5; i += 1) {
    expect(await detailOf(api, id)).toMatchObject({
      status: 'LIVE',
      startedAt,
      endedAt: null,
    });
    await page.waitForTimeout(1000);
  }
  // 버퍼에 남은 미디어로 currentTime이 timeAtReload를 조금 넘을 수 있고,
  // hls.js는 새 스트림의 타임라인에 붙을 때 앞으로 seek한다. 그래서 앞쪽 데이터가
  // 있고 실시간 속도로 흐를 때만 재생 중으로 본다.
  const advancing = async () => {
    const before = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    await viewer.waitForTimeout(2000);
    const after = await video.evaluate((v: HTMLVideoElement) => ({
      time: v.currentTime,
      ready: v.readyState >= v.HAVE_FUTURE_DATA,
    }));
    const pace = after.time - before;
    return after.time > timeAtReload && after.ready && pace > 1 && pace < 3;
  };
  await expect.poll(advancing, { timeout: 75_000 }).toBe(true);
  console.log(
    `reload → viewer playing again in ${((Date.now() - reloadedAt) / 1000).toFixed(1)} s`,
  );
  await page.waitForTimeout(10_000);
  expect(await advancing()).toBe(true);
  await expect(viewer.getByText('방송을 불러오는 중입니다')).toBeHidden();
  await screenshot(viewer, 'viewer-after-reconnect');
  expect(await statusOf(api, id)).toBe('LIVE');
  await viewerContext.close();

  await page.getByRole('button', { name: '방송 종료' }).click();
  await page.getByRole('button', { name: '종료하기' }).click();
  await expect(page.getByText('방송을 종료했습니다.')).toBeVisible();
});
