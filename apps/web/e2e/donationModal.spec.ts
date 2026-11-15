import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;
const AT = '2026-11-11T10:00:00.000Z';
const VIEWER = { id: 'u-viewer', nickname: '시청자' };

async function openBroadcast(page: Page, balance: number) {
  await page.route('**/api/**', (route) => route.fulfill({ status: 404 }));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: VIEWER }),
  );
  await page.route('**/api/me/follows', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/lime', (route) =>
    route.fulfill({ json: { balance } }),
  );
  await page.route('**/api/broadcasts/b1', (route) =>
    route.fulfill({
      json: {
        id: 'b1',
        title: '후원 모달 확인',
        description: '',
        category: 'ETC',
        game: null,
        status: 'LIVE',
        startedAt: AT,
        endedAt: null,
        disconnectedAt: null,
        createdAt: AT,
        recordingFiles: [],
        recordingParts: [],
        thumbnailUrl: null,
        standbyImageUrl: null,
        streamer: { id: 'u-streamer', nickname: '방송인' },
      },
    }),
  );
  await page.route('**/api/broadcasts/b1/donations', (route) =>
    route.fulfill({
      json: {
        total: 8000,
        count: 2,
        donations: [],
        ranking: [
          { donor: { id: 'u-a', nickname: '라임팬' }, total: 5000 },
          { donor: { id: 'u-b', nickname: '구경꾼' }, total: 3000 },
        ],
      },
    }),
  );
  await page.route('**/api/broadcasts/b1/chat**', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto('/broadcasts/b1');
}

test.describe('wide screen', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('후원하기 opens the lime form in a modal that Esc closes, returning focus', async ({
    page,
  }) => {
    await openBroadcast(page, 2000);
    const panel = page.getByRole('region', { name: '후원' });
    const donate = panel.getByRole('button', { name: '후원하기' });
    await expect(donate).toBeVisible();
    await expect(panel.getByRole('list', { name: '후원 순위' })).toBeVisible();
    await expect(
      page.getByRole('form', { name: '라임으로 후원' }),
    ).not.toBeVisible();
    if (SCREENSHOT_DIR)
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wide-panel.png` });

    await donate.click();
    const modal = page.getByRole('dialog', { name: '후원하기' });
    await expect(modal).toBeVisible();
    await expect(donate).toHaveAttribute('aria-expanded', 'true');
    await modal.getByRole('button', { name: '5,000라임' }).click();
    await expect(modal.getByText('라임이 3,000라임 부족합니다.')).toBeVisible();
    await expect(modal.getByRole('button', { name: '충전하기' })).toBeVisible();
    await expect(
      modal.getByRole('button', { name: '카드로 후원' }),
    ).toBeVisible();
    if (SCREENSHOT_DIR)
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wide-modal-short.png` });

    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(donate).toBeFocused();
    await expect(donate).toHaveAttribute('aria-expanded', 'false');

    await donate.click();
    await expect(modal).toBeVisible();
    // 모달 상자 바깥(배경)을 누른다.
    await page.mouse.click(10, 10);
    await expect(modal).not.toBeVisible();
    await expect(donate).toBeFocused();
  });
});

// Playwright Chromium은 마우스(`pointer: fine`)라 결제를 모달 안 iframe에서
// 한다(PRD-donation-modal 7.3, #181). 실제 Toss 결제는 하지 않는다.
test.describe('mouse PC at 1366×768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('카드로 후원 opens the payment page inside the modal without the app header', async ({
    page,
  }) => {
    await openBroadcast(page, 10_000);
    const startUrl = page.url();
    await page
      .getByRole('region', { name: '후원' })
      .getByRole('button', { name: '후원하기' })
      .click();
    const modal = page.getByRole('dialog', { name: '후원하기' });
    await modal.getByLabel(/메시지/).fill('응원');
    await modal.getByRole('button', { name: '카드로 후원' }).click();

    const paying = page.getByRole('dialog', { name: '카드로 후원' });
    await expect(paying.getByRole('button', { name: '뒤로' })).toBeFocused();
    const frame = page.frameLocator('iframe[title="카드로 후원 결제"]');
    await expect(frame.getByRole('button', { name: '다음' })).toBeVisible();
    await expect(frame.getByRole('banner')).toHaveCount(0);
    await expect(
      frame.getByRole('link', { name: '방송으로 돌아가기' }),
    ).toBeHidden();
    // 모달 머리가 제목을 보이므로 iframe 안 제목은 화면에서만 숨긴다.
    await expect(
      frame.getByRole('heading', { level: 1, name: '후원하기' }),
    ).toHaveCSS('position', 'absolute');
    const box = await paying.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(768);
    if (SCREENSHOT_DIR)
      await page.screenshot({ path: `${SCREENSHOT_DIR}/pc-modal-card.png` });

    await paying.getByRole('button', { name: '뒤로' }).click();
    await expect(modal.getByLabel(/메시지/)).toHaveValue('응원');
    expect(page.url()).toBe(startUrl);
  });

  test('a screen outside payments keeps its header inside a frame', async ({
    page,
  }) => {
    await openBroadcast(page, 10_000);
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.id = 'probe';
      frame.src = '/broadcasts/b1';
      document.body.append(frame);
    });
    await expect(page.frameLocator('#probe').getByRole('banner')).toHaveCount(
      1,
    );
  });
});

test.describe('narrow screen', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('the sheet keeps the lime form inline and opens no second modal', async ({
    page,
  }) => {
    await openBroadcast(page, 10_000);
    await page.getByRole('button', { name: '더 보기' }).click();
    const sheet = page.getByRole('dialog', { name: '후원 모달 확인' });
    await expect(
      sheet.getByRole('form', { name: '라임으로 후원' }),
    ).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: '후원하기' }),
    ).not.toHaveAttribute('aria-haspopup');
    await expect(page.getByRole('dialog', { name: '후원하기' })).toHaveCount(0);
    await sheet.getByRole('region', { name: '후원' }).scrollIntoViewIfNeeded();
    if (SCREENSHOT_DIR)
      await page.screenshot({ path: `${SCREENSHOT_DIR}/narrow-sheet.png` });
  });
});
