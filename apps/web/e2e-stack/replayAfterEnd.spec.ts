import { expect, test } from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  startPublishing,
  watchUntilPlaying,
} from './support';

// A viewer who keeps the watch page open through the end gets the replay
// without reloading, once the reconciler (30 s interval) settles the file.
// The page waits up to 90 s after endedAt (BroadcastPage REPLAY_WAIT_MS).
test('a viewer who stays on the page gets the replay after the end', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const api = page.context().request;
  await signUpAndLogIn(api);
  const id = await createBroadcast(api, `종료 뒤 다시보기 ${Date.now()}`);
  await startPublishing(page, id);

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);
  // OME writes the file only once the stream is up and a keyframe passed.
  await viewer.waitForTimeout(8000);

  const end = await api.post(`/api/broadcasts/${id}/end`);
  expect(end.status(), await end.text()).toBe(200);
  const endedAt = Date.now();

  // The replay notice also starts with this sentence, so it matches both.
  await expect(viewer.getByText(/^방송이 끝났습니다\./)).toBeVisible({
    timeout: 15_000,
  });
  // When the reconciler ticks before the page's next read, the page goes
  // straight to the replay and never shows the waiting line.
  const preparing = viewer.getByText('다시보기를 준비하는 중입니다.');
  if (await preparing.isVisible()) await screenshot(viewer, 'replay-preparing');

  await expect(viewer.getByLabel('다시보기 화면')).toBeVisible({
    timeout: 90_000,
  });
  console.log(
    `end → replay player on the open page in ${((Date.now() - endedAt) / 1000).toFixed(1)} s`,
  );
  await expect(viewer.getByText('다시보기를 준비하는 중입니다.')).toHaveCount(
    0,
  );
  await screenshot(viewer, 'replay-after-end');
  await viewerContext.close();
});
