import { execFileSync } from 'node:child_process';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  createBroadcast,
  logIn,
  screenshot,
  signUpAndLogIn,
  startPublishing,
  watchUntilPlaying,
  type Account,
} from './support';

// 실제 스택에서 PRD §8.3 시나리오 16을 확인한다: 라임 10,000을 충전하고, 시청 탭을
// 떠나지 않고 3,000을 후원하고, 잔액이 모자랄 때 두 버튼을 보고,
// 스트리머 자신의 후원이 403으로 거부되는지 본다.
//
// Toss 테스트 결제는 headless로 승인할 수 없다(카드 단계에 사람이 필요하다).
// 그래서 confirm 호출만 stub으로 대신한다. stub은 실제 confirm이 트랜잭션에서
// 하는 일을 SQL로 한다: 주문을 승인하고, 잔액을 적립하고, 원장 행을 쓴다.
// 주문, 잔액, 후원, 목록은
// 실제 API다.

const PG_CONTAINER = process.env.E2E_PG_CONTAINER ?? 'lsp-postgres-1';
const PG_DB = process.env.E2E_PG_DB ?? 'lsp';
const PG_USER = process.env.E2E_PG_USER ?? 'lsp';

function approveCharge(orderId: string, paymentKey: string): number {
  if (!/^lime_[0-9a-f]{32}$/.test(orderId) || !/^\w+$/.test(paymentKey)) {
    throw new Error(`unexpected charge ${orderId} ${paymentKey}`);
  }
  const sql = `
    WITH c AS (
      UPDATE "LimeCharge"
      SET status = 'APPROVED', "paymentKey" = '${paymentKey}', "approvedAt" = now()
      WHERE "orderId" = '${orderId}' AND status = 'PENDING'
      RETURNING id, "userId", amount
    ), u AS (
      UPDATE "User" SET "limeBalance" = "limeBalance" + c.amount
      FROM c WHERE "User".id = c."userId"
      RETURNING "User".id, "User"."limeBalance", c.amount, c.id AS charge
    )
    INSERT INTO "LimeLedger" (id, "userId", delta, kind, "refId", "balanceAfter")
    SELECT gen_random_uuid(), u.id, u.amount, 'CHARGE', u.charge, u."limeBalance"
    FROM u
    RETURNING "balanceAfter"`;
  const out = execFileSync(
    'docker',
    ['exec', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-tAqc', sql],
    { encoding: 'utf8' },
  );
  return Number(out.trim().split('\n')[0]);
}

// 페이지 안에서 250ms마다 영상의 currentTime을 기록한다. 그래서 다른 탭이 앞에 있거나
// 요청이 진행 중일 때 생긴 멈춤이 드러난다.
async function startSampling(page: Page) {
  await page.getByLabel('방송 화면').evaluate((video: HTMLVideoElement) => {
    const w = window as unknown as { __samples: [number, number][] };
    w.__samples = [];
    setInterval(() => {
      w.__samples.push([performance.now(), video.currentTime]);
    }, 250);
  });
}

// currentTime이 움직이지 않은 가장 긴 실제 시간 구간.
async function longestStall(page: Page): Promise<{
  stallMs: number;
  playedS: number;
  spanMs: number;
}> {
  const samples = await page.evaluate(
    () => (window as unknown as { __samples: [number, number][] }).__samples,
  );
  let stallMs = 0;
  let since = samples[0][0];
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i][1] > samples[i - 1][1]) since = samples[i][0];
    else stallMs = Math.max(stallMs, samples[i][0] - since);
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  return {
    stallMs,
    playedS: last[1] - first[1],
    spanMs: last[0] - first[0],
  };
}

async function viewerContext(
  browser: Browser,
  viewport: { width: number; height: number },
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
  });
  await context.route('**/api/lime/charges/confirm', async (route) => {
    const body = route.request().postDataJSON() as {
      orderId: string;
      paymentKey: string;
      amount: number;
    };
    const balanceAfter = approveCharge(body.orderId, body.paymentKey);
    await route.fulfill({
      json: {
        orderId: body.orderId,
        amount: body.amount,
        approvedAt: new Date().toISOString(),
        balanceAfter,
      },
    });
  });
  return context;
}

test('scenario 16: charge, then donate lime without leaving the watch tab', async ({
  page,
  browser,
}) => {
  await signUpAndLogIn(page.request, '라임방송');
  const id = await createBroadcast(page.request, '라임 후원 확인');
  await startPublishing(page, id);

  const context = await viewerContext(browser, { width: 1440, height: 900 });
  const viewer = await context.newPage();
  const donor: Account = await signUpAndLogIn(viewer.request, '라임후원자');

  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);
  let navigations = 0;
  viewer.on('framenavigated', (frame) => {
    if (frame === viewer.mainFrame()) navigations += 1;
  });
  await startSampling(viewer);

  const panel = viewer.getByRole('region', { name: '후원' });
  const form = panel.getByRole('form', { name: '라임으로 후원' });
  const balance = form.locator('p strong').first();
  await expect(balance).toHaveText('0라임');

  // 1. 새 탭에서 라임 10,000을 충전한다.
  const [charge] = await Promise.all([
    viewer.waitForEvent('popup'),
    form.getByRole('button', { name: '충전하기' }).click(),
  ]);
  await expect(charge).toHaveURL(/\/lime\/charge$/);
  await charge.getByRole('button', { name: '10,000라임' }).click();
  const [ordered] = await Promise.all([
    charge.waitForResponse(
      (r) =>
        r.url().endsWith('/api/lime/charges') &&
        r.request().method() === 'POST',
    ),
    charge.getByRole('button', { name: '다음' }).click(),
  ]);
  expect(ordered.status()).toBe(201);
  const { orderId } = (await ordered.json()) as { orderId: string };
  // 승인 뒤 Toss가 여기로 리다이렉트한다.
  await charge.goto(
    `/lime/charge/success?paymentType=NORMAL&orderId=${orderId}&paymentKey=pk_e2e_${Date.now()}&amount=10000`,
  );
  await expect(
    charge.getByRole('heading', { name: '충전했습니다.' }),
  ).toBeVisible();
  // 충전 탭의 메시지. 30초 잔액 폴링보다 훨씬 빠르다.
  await expect(balance).toHaveText('10,000라임', { timeout: 3_000 });
  await charge.close();

  // 2. 시청 탭에서 라임 3,000을 후원한다.
  await viewer.bringToFront();
  await form.getByLabel('직접 입력 (라임)').fill('3000');
  await form.getByLabel(/메시지/).fill('라임으로 응원합니다');
  const [donated] = await Promise.all([
    viewer.waitForResponse((r) => r.url().endsWith('/lime-donations')),
    form.getByRole('button', { name: '라임으로 후원' }).click(),
  ]);
  expect(donated.status()).toBe(201);
  await expect(panel.getByRole('status')).toHaveText('후원이 반영되었습니다');
  await expect(balance).toHaveText('7,000라임');
  const item = panel.getByRole('listitem').first();
  await expect(item).toContainText(donor.nickname);
  await expect(item).toContainText('3,000라임');
  await expect(item).toContainText('라임으로 응원합니다');
  await expect(panel.locator('strong').first()).toHaveText('3,000원');
  await screenshot(viewer, 'pc-donated');

  // 3. 잔액보다 많으면: 대신 충전하거나 카드로 결제한다.
  await form.getByRole('button', { name: '10,000라임' }).click();
  await expect(form.getByRole('button', { name: '라임으로 후원' })).toHaveCount(
    0,
  );
  await expect(form.getByText('라임이 3,000라임 부족합니다.')).toBeVisible();
  await expect(form.getByRole('button', { name: '충전하기' })).toBeVisible();
  await expect(form.getByRole('button', { name: '카드로 후원' })).toBeVisible();
  await screenshot(viewer, 'pc-short');

  // 시청 탭은 한 번도 이동하지 않았고 영상도 한 번도 멈추지 않았다.
  expect(navigations, 'the watch tab stayed on the page').toBe(0);
  expect(viewer.url()).toMatch(new RegExp(`/broadcasts/${id}$`));
  const played = await longestStall(viewer);
  expect(played.stallMs, JSON.stringify(played)).toBeLessThan(1_500);
  expect(played.playedS * 1000).toBeGreaterThan(played.spanMs - 2_000);

  // 4. 스트리머가 자기 방송에 API를 부르면 403을 받는다.
  const own = await page.request.post(`/api/broadcasts/${id}/lime-donations`, {
    data: { amount: 1000, orderId: crypto.randomUUID() },
  });
  expect(own.status()).toBe(403);
  await expect(panel.getByRole('listitem')).toHaveCount(1);

  // 5. 휴대폰: 더 보기 시트 안의 같은 폼.
  const phoneContext = await viewerContext(browser, {
    width: 390,
    height: 844,
  });
  const phone = await phoneContext.newPage();
  await logIn(phone.request, donor);
  await phone.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(phone);
  await startSampling(phone);
  await phone.getByRole('button', { name: '더 보기' }).click();
  const sheet = phone.getByRole('dialog');
  const sheetForm = sheet.getByRole('form', { name: '라임으로 후원' });
  await expect(sheetForm.locator('p strong').first()).toHaveText('7,000라임');
  await sheetForm.getByRole('button', { name: '1,000라임' }).click();
  await sheetForm.getByRole('button', { name: '라임으로 후원' }).click();
  await expect(sheetForm.locator('p strong').first()).toHaveText('6,000라임');
  await expect(sheet.getByRole('listitem')).toHaveCount(2);
  await sheet
    .getByRole('heading', { name: '후원', exact: true })
    .scrollIntoViewIfNeeded();
  await screenshot(phone, 'mobile-donated');
  await sheetForm.getByRole('button', { name: '10,000라임' }).click();
  await expect(
    sheetForm.getByRole('button', { name: '충전하기' }),
  ).toBeVisible();
  await expect(
    sheetForm.getByRole('button', { name: '카드로 후원' }),
  ).toBeVisible();
  await sheetForm.scrollIntoViewIfNeeded();
  await screenshot(phone, 'mobile-short');
  const phonePlayed = await longestStall(phone);
  expect(phonePlayed.stallMs, JSON.stringify(phonePlayed)).toBeLessThan(1_500);

  await phoneContext.close();
  await context.close();
});
