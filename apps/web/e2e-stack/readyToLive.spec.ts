import { expect, test } from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  startPublishing,
  watchUntilPlaying,
} from './support';

test('a viewer waiting on a READY broadcast gets the player once it goes LIVE', async ({
  page,
  browser,
}) => {
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '방송 전 안내');

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  const notice = viewer.getByText(
    '방송 전입니다. 스트리머가 방송을 시작하면 자동으로 재생합니다.',
  );
  await expect(notice).toBeVisible();
  await screenshot(viewer, 'viewer-ready');
  let reloaded = false;
  viewer.on('framenavigated', (frame) => {
    if (frame === viewer.mainFrame()) reloaded = true;
  });

  await startPublishing(page, id);
  await expect(notice).toBeHidden({ timeout: 10_000 });
  await watchUntilPlaying(viewer);
  const elapsed = viewer.locator('time').first();
  const first = await elapsed.textContent();
  await expect(elapsed).not.toHaveText(first ?? '', { timeout: 3_000 });
  expect(reloaded).toBe(false);
  await screenshot(viewer, 'viewer-live-elapsed');
  await viewerContext.close();

  const end = await page.request.post(`/api/broadcasts/${id}/end`);
  expect(end.status(), await end.text()).toBe(200);
});
