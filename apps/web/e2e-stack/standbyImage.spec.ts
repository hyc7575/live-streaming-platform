import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createBroadcast,
  drawImage,
  screenshot,
  signUpAndLogIn,
  startPublishing,
  watchUntilPlaying,
} from './support';

const READY_NOTICE = '방송 준비 중입니다.';

async function choose(
  page: Page,
  name: string,
  mimeType: string,
  buffer: Buffer,
) {
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name, mimeType, buffer });
}

async function loaded(img: Locator) {
  return img.evaluate((el: HTMLImageElement) => ({
    src: el.getAttribute('src'),
    complete: el.complete,
    width: el.naturalWidth,
  }));
}

async function expectShows(img: Locator, src: RegExp | string) {
  await expect
    .poll(() => loaded(img), { timeout: 10_000 })
    .toMatchObject({
      src: typeof src === 'string' ? src : expect.stringMatching(src),
      complete: true,
      width: 640,
    });
}

function cardImage(page: Page, id: string) {
  return page.locator(`a[href="/broadcasts/${id}"] img`);
}

test('the standby image shows on READY broadcasts until the live frame replaces it', async ({
  page,
  browser,
}) => {
  const streamer = await signUpAndLogIn(page.request, '대기 이미지');
  const standbyPath = `/thumbnails/users/${streamer.id}/standby`;

  await page.goto('/studio/channel');
  await expect(
    page.getByRole('heading', { name: '기본 대기 이미지' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '삭제' })).toBeHidden();
  await screenshot(page, 'channel-empty-desktop');
  await page.setViewportSize({ width: 360, height: 780 });
  await screenshot(page, 'channel-empty-360');
  await page.setViewportSize({ width: 1280, height: 900 });

  await choose(
    page,
    'standby.png',
    'image/png',
    await drawImage(page, 'image/png', '#2f6f4f'),
  );
  const preview = page.locator('main img');
  await expectShows(preview, new RegExp(`^${standbyPath}\\.png\\?v=\\d+$`));
  const pngUrl = (await loaded(preview)).src!;

  await choose(
    page,
    'standby.webp',
    'image/webp',
    await drawImage(page, 'image/webp', '#6f2f5f'),
  );
  await expectShows(preview, new RegExp(`^${standbyPath}\\.webp\\?v=\\d+$`));
  const webpUrl = (await loaded(preview)).src!;
  expect(webpUrl, 'a new image gets a new cache key').not.toBe(pngUrl);
  const oldFile = await page.request.get(pngUrl.split('?')[0]);
  expect(oldFile.status(), 'the previous format is removed').toBe(404);
  await screenshot(page, 'channel-image-desktop');
  await page.setViewportSize({ width: 360, height: 780 });
  await screenshot(page, 'channel-image-360');
  await page.setViewportSize({ width: 1280, height: 900 });

  const id = await createBroadcast(page.request, '대기 이미지 방송');
  await page.goto('/studio');
  await expectShows(cardImage(page, id), webpUrl);
  await screenshot(page, 'studio-ready-card-desktop');
  await page.setViewportSize({ width: 360, height: 780 });
  await screenshot(page, 'studio-ready-card-360');
  await page.setViewportSize({ width: 1280, height: 900 });

  const viewerContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  await expect(viewer.getByText(READY_NOTICE)).toBeVisible();
  await expectShows(viewer.locator('main img').first(), webpUrl);
  await screenshot(viewer, 'viewer-ready-standby-desktop');
  await viewer.setViewportSize({ width: 360, height: 780 });
  await screenshot(viewer, 'viewer-ready-standby-360');
  await viewer.setViewportSize({ width: 1280, height: 900 });

  await startPublishing(page, id);
  await expect(viewer.getByText(READY_NOTICE)).toBeHidden({ timeout: 10_000 });
  await watchUntilPlaying(viewer);

  // The first capture uploads right after the publish connects. The list
  // refetches every 30 s, so a reload reads the new thumbnailUrl now.
  await expect
    .poll(
      async () => {
        await viewer.goto('/');
        return cardImage(viewer, id).getAttribute('src');
      },
      { timeout: 30_000, intervals: [2_000] },
    )
    .toMatch(new RegExp(`^/thumbnails/${id}/live\\.jpg\\?v=\\d+$`));
  await viewerContext.close();

  const end = await page.request.post(`/api/broadcasts/${id}/end`);
  expect(end.status(), await end.text()).toBe(200);
  const remove = await page.request.delete(`/api/broadcasts/${id}`);
  expect(remove.status()).toBe(204);
  const kept = await page.request.get(webpUrl);
  expect(kept.status(), 'deleting the broadcast keeps the standby image').toBe(
    200,
  );

  await page.goto('/studio/channel');
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제하기' }).click();
  await expect(preview).toHaveCount(0, { timeout: 10_000 });
  const me = await page.request.get('/api/auth/me');
  expect(
    ((await me.json()) as { standbyImageUrl: string | null }).standbyImageUrl,
  ).toBeNull();
});
