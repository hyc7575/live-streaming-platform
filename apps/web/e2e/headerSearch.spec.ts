import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;
const AT = '2026-11-11T10:00:00.000Z';
const VIEWER = {
  id: 'u-viewer',
  nickname: '가나다라마바사아자차카타파하거너더러머버',
};
const EMPTY_RESULT = { streamers: [], broadcasts: [], past: [] };

type Who = 'anonymous' | 'loggedIn';

async function stubApi(page: Page, who: Who) {
  await page.route('**/api/**', (route) => route.fulfill({ status: 404 }));
  await page.route('**/api/auth/me', (route) =>
    who === 'anonymous'
      ? route.fulfill({ status: 401 })
      : route.fulfill({ json: VIEWER }),
  );
  await page.route('**/api/me/follows', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/broadcasts', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/broadcasts?status=LIVE', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route('**/api/search?**', (route) =>
    route.fulfill({ json: EMPTY_RESULT }),
  );
  await page.route('**/api/broadcasts/b1', (route) =>
    route.fulfill({
      json: {
        id: 'b1',
        title: '헤더 검색 확인',
        description: '',
        category: 'ETC',
        game: null,
        status: 'READY',
        startedAt: null,
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
}

async function openPage(page: Page, who: Who, path = '/search') {
  await stubApi(page, who);
  await page.goto(path);
  await expect(
    who === 'anonymous'
      ? header(page).getByRole('link', { name: '로그인', exact: true })
      : header(page).getByRole('button', { name: VIEWER.nickname }),
  ).toBeVisible();
}

const header = (page: Page) => page.getByRole('banner');
const magnifier = (page: Page) =>
  header(page).getByRole('button', { name: '검색', exact: true });
const searchbox = (page: Page) =>
  header(page).getByRole('searchbox', { name: '검색' });

async function measureHeader(page: Page) {
  return header(page).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const children = [...el.children]
      .map((child) => child.getBoundingClientRect())
      .filter((r) => r.width > 0);
    const middles = children.map((r) => Math.round(r.top + r.height / 2));
    const slot = el.querySelector('form[role="search"]')!.parentElement!;
    const icon = slot.querySelector('button[aria-label="검색"]')!;
    return {
      height: box.height,
      oneRow: new Set(middles).size === 1,
      headerFits: el.scrollWidth <= el.clientWidth,
      pageWidth: document.scrollingElement!.scrollWidth,
      slack:
        slot.getBoundingClientRect().width - icon.getBoundingClientRect().width,
    };
  });
}

for (const who of ['anonymous', 'loggedIn'] as const) {
  for (const width of [360, 480, 481, 1023, 1024]) {
    test(`header stays one row without page scroll at ${width}px, ${who}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await openPage(page, who);

      const measured = await measureHeader(page);
      expect(measured.height).toBe(56);
      expect(measured.oneRow, 'every header item sits on one row').toBe(true);
      expect(measured.headerFits, 'nothing overflows the header').toBe(true);
      expect(measured.pageWidth).toBe(width);
      if (width < 1024) {
        await expect(magnifier(page)).toBeVisible();
        await expect(searchbox(page)).toBeHidden();
        console.log(`slack ${width}px ${who}: ${measured.slack}px`);
      } else {
        await expect(magnifier(page)).toBeHidden();
        await expect(searchbox(page)).toBeVisible();
      }
      if (SCREENSHOT_DIR)
        await header(page).screenshot({
          path: `${SCREENSHOT_DIR}/header-${width}-${who}.png`,
        });
    });
  }
}

test('the magnifier swaps the 360px header for the search row and Escape swaps it back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openPage(page, 'loggedIn');

  await magnifier(page).click();
  await expect(searchbox(page)).toBeVisible();
  await expect(searchbox(page)).toBeFocused();
  await expect(header(page).getByRole('link', { name: 'Lime' })).toBeHidden();
  expect((await measureHeader(page)).height).toBe(56);
  if (SCREENSHOT_DIR)
    await header(page).screenshot({
      path: `${SCREENSHOT_DIR}/header-360-open.png`,
    });

  await page.keyboard.press('Escape');
  await expect(magnifier(page)).toBeFocused();
  await expect(searchbox(page)).toBeHidden();
});

async function composeKorean(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  for (const text of ['ㄹ', '리', '릭', '리그']) {
    await cdp.send('Input.imeSetComposition', {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
  }
  return cdp;
}

test.describe('searching from the watch page', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a confirmed Korean word searches once and back returns to the watch page', async ({
    page,
  }) => {
    await openPage(page, 'anonymous', '/broadcasts/b1');
    const historyLength = await page.evaluate(() => history.length);

    await searchbox(page).click();
    const cdp = await composeKorean(page);
    await cdp.send('Input.insertText', { text: '리그' });
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/search\?q=/);
    expect(new URL(page.url()).searchParams.get('q')).toBe('리그');
    expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
    await page.goBack();
    await expect(page).toHaveURL(/\/broadcasts\/b1$/);
  });

  test('Enter during a Korean composition searches the whole word exactly once', async ({
    page,
  }) => {
    await openPage(page, 'anonymous', '/broadcasts/b1');
    const historyLength = await page.evaluate(() => history.length);

    await searchbox(page).click();
    await composeKorean(page);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/search\?q=/);
    expect(new URL(page.url()).searchParams.get('q')).toBe('리그');
    await expect(searchbox(page)).toHaveValue('리그');
    expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  });
});

test('an old home search address replaces itself with the results page', async ({
  page,
}) => {
  await stubApi(page, 'anonymous');
  await page.goto('/');
  const historyLength = await page.evaluate(() => history.length);

  await page.goto('/?q=%EB%A6%AC%EA%B7%B8');

  await expect(
    page.getByRole('heading', { level: 1, name: "'리그' 검색 결과" }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/search');
  expect(new URL(page.url()).searchParams.get('q')).toBe('리그');
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
});
