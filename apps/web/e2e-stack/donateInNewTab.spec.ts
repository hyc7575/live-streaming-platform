import { expect, test, type Page } from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  startPublishing,
  watchUntilPlaying,
} from './support';

// Real stack for the video; the donation API is stubbed in the viewer's
// context because a Toss test payment cannot be approved headlessly. What is
// under test is the tab handling around it (PRD-lime 7.1·7.2).

async function currentTime(viewer: Page): Promise<number> {
  return viewer
    .getByLabel('방송 화면')
    .evaluate((v: HTMLVideoElement) => v.currentTime);
}

test('donating in a new tab keeps the watch tab playing and reports back', async ({
  page,
  browser,
}) => {
  await signUpAndLogIn(page.request, '라임방송');
  const id = await createBroadcast(page.request, '새 탭 후원 확인');
  await startPublishing(page, id);

  const viewerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const viewer = await viewerContext.newPage();
  const donor = await signUpAndLogIn(viewer.request, '후원자');

  const donation = {
    id: 'don-e2e',
    amount: 5000,
    message: '',
    approvedAt: new Date().toISOString(),
    donor: { id: donor.id, nickname: donor.nickname },
  };
  let paid = false;
  let summaryReads = 0;
  await viewerContext.route(`**/api/broadcasts/${id}/donations`, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    summaryReads += 1;
    return route.fulfill({
      json: paid
        ? { total: 5000, count: 1, donations: [donation] }
        : { total: 0, count: 0, donations: [] },
    });
  });
  await viewerContext.route('**/api/donations/confirm', (route) => {
    paid = true;
    return route.fulfill({ json: { ...donation, broadcastId: id } });
  });

  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);
  const panel = viewer.getByRole('region', { name: '후원' });
  await expect(panel.getByText('아직 후원이 없습니다.')).toBeVisible();

  const [payment] = await Promise.all([
    viewer.waitForEvent('popup'),
    panel.getByRole('button', { name: '후원하기' }).click(),
  ]);
  await expect(payment).toHaveURL(new RegExp(`/broadcasts/${id}/donate$`));
  await expect(
    payment.getByRole('button', { name: '5,000원' }),
    'the donate page loaded in the new tab',
  ).toBeVisible();
  expect(viewer.url(), 'the watch tab stayed put').toMatch(
    new RegExp(`/broadcasts/${id}$`),
  );

  // The watch tab keeps playing while the payment tab is in front.
  await payment.bringToFront();
  const before = await currentTime(viewer);
  await expect
    .poll(() => currentTime(viewer), { timeout: 15_000 })
    .toBeGreaterThan(before + 3);
  await screenshot(payment, 'donate-new-tab');

  const readsAtConfirm = summaryReads;
  // Toss would redirect here after approval.
  await payment.goto(
    `/donations/success?paymentType=NORMAL&orderId=don_e2e&paymentKey=pk_e2e&amount=5000`,
  );
  await expect(
    payment.getByRole('heading', { name: '후원했습니다.' }),
  ).toBeVisible();

  // Well under the 5 s poll: the payment tab's message triggered the read.
  await expect(panel.getByRole('status')).toHaveText('후원이 반영되었습니다', {
    timeout: 2_000,
  });
  // The total; the lime form below has its own <strong> for the balance.
  await expect(panel.locator('strong').first()).toHaveText('5,000원');
  await expect(panel.getByText('1건')).toBeVisible();
  expect(summaryReads).toBeGreaterThan(readsAtConfirm);
  await screenshot(viewer, 'donate-reported-back');

  const closed = payment.waitForEvent('close');
  await payment.getByRole('button', { name: '방송으로 돌아가기' }).click();
  await closed;
  expect(await currentTime(viewer)).toBeGreaterThan(before + 3);

  // A tab the browser will not close (opened by hand, then redirected) goes
  // to the broadcast instead.
  const typed = await viewerContext.newPage();
  await typed.goto('/');
  await typed.goto(
    `/donations/success?paymentType=NORMAL&orderId=don_e2e&paymentKey=pk_e2e&amount=5000`,
  );
  await typed.getByRole('button', { name: '방송으로 돌아가기' }).click();
  await expect(typed).toHaveURL(new RegExp(`/broadcasts/${id}$`));
  expect(typed.isClosed()).toBe(false);

  await viewerContext.close();
});
