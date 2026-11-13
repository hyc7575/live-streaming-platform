import { expect, test, type Page } from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  startPublishing,
  watchUntilPlaying,
} from './support';

// 영상은 실제 스택을 쓴다. Toss 테스트 결제는 headless로 승인할 수 없어 후원 API는
// 시청자의 context에서 stub으로 대신한다. 검증 대상은 그 주변의
// 탭 처리다(PRD-lime 7.1·7.2).

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

  // 결제 탭이 앞에 있는 동안에도 시청 탭은 계속 재생한다.
  await payment.bringToFront();
  const before = await currentTime(viewer);
  await expect
    .poll(() => currentTime(viewer), { timeout: 15_000 })
    .toBeGreaterThan(before + 3);
  await screenshot(payment, 'donate-new-tab');

  const readsAtConfirm = summaryReads;
  // 승인 뒤 Toss가 여기로 리다이렉트한다.
  await payment.goto(
    `/donations/success?paymentType=NORMAL&orderId=don_e2e&paymentKey=pk_e2e&amount=5000`,
  );
  await expect(
    payment.getByRole('heading', { name: '후원했습니다.' }),
  ).toBeVisible();

  // 5초 폴링보다 훨씬 빠르다. 결제 탭의 메시지가 다시 읽기를 일으켰다.
  await expect(panel.getByRole('status')).toHaveText('후원이 반영되었습니다', {
    timeout: 2_000,
  });
  // 합계. 아래 라임 폼에는 잔액용 <strong>이 따로 있다.
  await expect(panel.locator('strong').first()).toHaveText('5,000원');
  await expect(panel.getByText('1건')).toBeVisible();
  expect(summaryReads).toBeGreaterThan(readsAtConfirm);
  await screenshot(viewer, 'donate-reported-back');

  const closed = payment.waitForEvent('close');
  await payment.getByRole('button', { name: '방송으로 돌아가기' }).click();
  await closed;
  expect(await currentTime(viewer)).toBeGreaterThan(before + 3);

  // 브라우저가 닫지 않는 탭(손으로 연 뒤 리다이렉트된 탭)은 닫히는 대신
  // 방송으로 이동한다.
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
