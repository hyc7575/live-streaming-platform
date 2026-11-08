import { expect, test } from '@playwright/test';
import { openPreview, PHONE } from './phone';

test.use({
  ...PHONE,
  launchOptions: { args: ['--use-fake-device-for-media-stream'] },
});

test('hides the camera switch on a phone with one camera', async ({ page }) => {
  await openPreview(page);
  await expect(
    page.getByRole('button', { name: '미리보기 끝내기' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /카메라로 전환/ })).toHaveCount(
    0,
  );
});
