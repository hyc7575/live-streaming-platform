import { expect, test } from '@playwright/test';
import {
  createBroadcast,
  drawImage,
  screenshot,
  signUpAndLogIn,
} from './support';

const READY_NOTICE = '방송 준비 중입니다.';

test('an anonymous visitor finds a READY broadcast in the list and waits on its watch page', async ({
  page,
  browser,
}) => {
  await signUpAndLogIn(page.request);
  const title = `준비 중 ${Date.now()}`;
  const id = await createBroadcast(page.request, title);

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto('/');
  const card = viewer.getByRole('link', { name: new RegExp(title) });
  await expect(card.getByText('방송 준비 중')).toBeVisible();
  await expect(card).toHaveAttribute('href', `/broadcasts/${id}`);
  await screenshot(viewer, 'list-ready-card');

  await viewer.getByRole('link', { name: '방송 준비 중', exact: true }).click();
  await expect(viewer).toHaveURL(/\?status=READY$/);
  await expect(card).toBeVisible();
  const cards = viewer.locator('main a[href^="/broadcasts/"]');
  await expect(cards.filter({ hasNotText: '방송 준비 중' })).toHaveCount(0);
  await screenshot(viewer, 'list-ready-tab');

  await card.click();
  await expect(viewer.getByText(READY_NOTICE)).toBeVisible();
  await expect(viewer.locator('main img')).toHaveCount(0);
  await screenshot(viewer, 'watch-ready-no-standby');

  const upload = await page.request.put('/api/me/standby-image', {
    multipart: {
      image: {
        name: 'standby.png',
        mimeType: 'image/png',
        buffer: await drawImage(viewer, 'image/png', '#2d6a4f'),
      },
    },
  });
  expect(upload.status(), await upload.text()).toBe(200);
  await viewer.reload();
  await expect(viewer.getByText(READY_NOTICE)).toBeVisible();
  const standby = viewer.locator('main img').first();
  await expect
    .poll(() => standby.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await screenshot(viewer, 'watch-ready-standby');
  await viewerContext.close();

  expect((await page.request.delete('/api/me/standby-image')).status()).toBe(
    204,
  );
  expect((await page.request.delete(`/api/broadcasts/${id}`)).status()).toBe(
    204,
  );
});
