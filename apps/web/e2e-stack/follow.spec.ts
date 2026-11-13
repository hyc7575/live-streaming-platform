import { expect, test, type Page } from '@playwright/test';
import {
  clientIp,
  createBroadcast,
  screenshot,
  signUp,
  signUpAndLogIn,
  startPublishing,
  watchUntilPlaying,
} from './support';

const TITLE = '팔로우 확인 방송';

// A screenshot taken in the frame right after a resize can catch a half-painted
// page, so let two frames pass first.
async function resize(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
}

test('a follow from the watch page shows in the panel, goes offline, and leaves on unfollow', async ({
  page,
  browser,
  request,
}) => {
  // The panel re-reads every 30 s, so seeing the broadcast end can take that.
  test.setTimeout(240_000);
  const streamer = await signUpAndLogIn(page.request, '라임조아');
  const id = await createBroadcast(page.request, TITLE);
  await startPublishing(page, id);
  // Earlier runs can leave broadcasts by the same nickname, so entries are
  // found by the link to this broadcast.
  const toThisBroadcast = `a[href="/broadcasts/${id}"]`;

  const ownerView = await page.context().newPage();
  await ownerView.goto(`/broadcasts/${id}`);
  await expect(
    ownerView.getByRole('heading', { level: 1, name: TITLE }),
  ).toBeVisible();
  await expect(
    ownerView.getByRole('button', { name: '방송 종료' }),
    'owner view has loaded',
  ).toBeVisible();
  await expect(ownerView.getByRole('button', { name: '팔로우' })).toHaveCount(
    0,
  );
  await expect(
    ownerView.getByRole('link', { name: '로그인하고 팔로우' }),
  ).toHaveCount(0);
  await ownerView.close();

  const viewerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Keeps the logo dot still for the screenshots.
    reducedMotion: 'reduce',
  });
  const viewer = await viewerContext.newPage();
  await signUpAndLogIn(viewer.request, '구경꾼');
  await viewer.goto(`/broadcasts/${id}`);
  const panel = viewer.getByRole('complementary', {
    name: '팔로우한 스트리머',
  });
  await expect(
    panel.getByText('방송을 보다가 팔로우하면 여기에 보입니다.'),
  ).toBeVisible();

  await viewer.getByRole('button', { name: '팔로우' }).click();
  await expect(viewer.getByRole('button', { name: '팔로잉' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const entry = panel.locator(toThisBroadcast);
  await expect(entry).toContainText(streamer.nickname);
  await expect(entry).toContainText(TITLE);
  await watchUntilPlaying(viewer);
  await expect(viewer.getByText('방송을 불러오는 중입니다')).toBeHidden();
  await screenshot(viewer, '1440-expanded');

  await resize(viewer, 1100, 900);
  await expect(entry).toHaveAttribute(
    'title',
    `${streamer.nickname} · ${TITLE}`,
  );
  await expect(entry.getByText(TITLE)).toBeHidden();
  await screenshot(viewer, '1100-collapsed');

  await resize(viewer, 360, 780);
  await expect(panel).toBeHidden();
  const menu = viewer.getByRole('link', { name: '팔로잉', exact: true });
  await expect(menu).toBeVisible();
  await screenshot(viewer, '360-hidden-menu');
  await menu.click();
  await expect(
    viewer.getByRole('heading', { level: 1, name: '팔로우한 스트리머' }),
  ).toBeVisible();
  await expect(viewer.getByRole('main').locator(toThisBroadcast)).toContainText(
    streamer.nickname,
  );
  await screenshot(viewer, '360-following');

  const newcomer = await signUp(request, '새시청자');
  const anonymousContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    // Login is rate limited per client IP, like signup.
    extraHTTPHeaders: { 'X-Forwarded-For': clientIp() },
  });
  const anonymous = await anonymousContext.newPage();
  await anonymous.goto('/');
  const livePanel = anonymous.getByRole('complementary', {
    name: 'LIVE 중인 방송',
  });
  await expect(livePanel.locator(toThisBroadcast)).toContainText(
    streamer.nickname,
  );
  await screenshot(anonymous, '1440-anonymous');

  await anonymous.goto(`/broadcasts/${id}`);
  await expect(
    anonymous.getByRole('link', { name: '로그인하고 팔로우' }),
  ).toBeVisible();
  await livePanel
    .getByRole('link', { name: '로그인하고 스트리머를 팔로우해 보세요' })
    .click();
  await anonymous.getByLabel('이메일').fill(newcomer.email);
  await anonymous.getByLabel('비밀번호').fill(newcomer.password);
  await anonymous
    .getByRole('main')
    .getByRole('button', { name: '로그인', exact: true })
    .click();
  await expect(anonymous, 'back on the page the login started from').toHaveURL(
    `/broadcasts/${id}`,
  );
  await expect(anonymous.getByRole('button', { name: '팔로우' })).toBeVisible();
  await expect(
    anonymous.getByRole('complementary', { name: '팔로우한 스트리머' }),
  ).toBeVisible();
  await anonymousContext.close();

  await resize(viewer, 1440, 900);
  await viewer.goto(`/broadcasts/${id}`);
  await page.getByRole('button', { name: '방송 종료' }).click();
  await page.getByRole('button', { name: '종료하기' }).click();
  await expect(page.getByText('방송을 종료했습니다.')).toBeVisible();

  const offline = panel
    .getByRole('listitem')
    .filter({ hasText: streamer.nickname });
  await expect(offline).toContainText('오프라인', { timeout: 40_000 });
  // An offline streamer opens their channel page, no longer their broadcast.
  await expect(offline.getByRole('link')).toHaveAttribute(
    'href',
    `/channels/${streamer.id}`,
  );

  await viewer.getByRole('button', { name: '팔로잉' }).click();
  await expect(viewer.getByRole('button', { name: '팔로우' })).toBeVisible();
  await expect(offline).toHaveCount(0);
  await expect(
    panel.getByText('방송을 보다가 팔로우하면 여기에 보입니다.'),
  ).toBeVisible();
  await viewerContext.close();
});
