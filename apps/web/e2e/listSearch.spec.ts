import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

function broadcast(
  id: string,
  title: string,
  nickname: string,
  status: 'LIVE' | 'ENDED',
) {
  return {
    id,
    title,
    description: '',
    status,
    startedAt: null,
    endedAt: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    recordingFiles: [],
    streamer: { id: `u-${nickname}`, nickname },
  };
}

const BROADCASTS = [
  broadcast('b1', '저녁 코딩 방송', '불씨', 'LIVE'),
  broadcast('b2', 'Minecraft 생존 7일차', '라임', 'LIVE'),
  broadcast('b3', '아침 라디오', 'MoonLight', 'LIVE'),
  broadcast('b4', '어제 코딩 다시보기', '불씨', 'ENDED'),
  broadcast('b5', '피아노 연습', 'pianoman', 'ENDED'),
  broadcast('b6', 'minecraft 건축', '돌멩이', 'ENDED'),
];

async function openList(page: Page, path = '/') {
  await page.route('**/api/**', (route) => route.fulfill({ status: 404 }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401 }));
  await page.route('**/api/broadcasts', (route) =>
    route.fulfill({ json: BROADCASTS }),
  );
  await page.goto(path);
  await expect(page.getByText('저녁 코딩 방송')).toBeVisible();
  return page.getByRole('searchbox', { name: '방송 검색' });
}

const cards = (page: Page) => page.getByRole('listitem');

test('fast typing and Korean IME input reach the search box intact', async ({
  page,
}) => {
  const search = await openList(page);
  const historyLength = await page.evaluate(() => history.length);

  await search.pressSequentially('minecraft');
  await expect(search).toHaveValue('minecraft');
  await expect(cards(page)).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get('q')).toBe('minecraft');
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  await search.fill('');
  const cdp = await page.context().newCDPSession(page);
  for (const text of ['ㅋ', '코', '콛', '코디', '코딩']) {
    await cdp.send('Input.imeSetComposition', {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
  }
  await cdp.send('Input.insertText', { text: '코딩' });
  await expect(search).toHaveValue('코딩');
  await expect(cards(page)).toHaveCount(2);
});

for (const width of [1280, 360]) {
  test(`search box, filtered list and no-match notice at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const search = await openList(page);
    const shot = (name: string) =>
      SCREENSHOT_DIR &&
      page.screenshot({ path: `${SCREENSHOT_DIR}/${width}-${name}.png` });
    await shot('list');

    if (width === 360) {
      const box = await search.boundingBox();
      const main = await page.locator('section').first().boundingBox();
      expect(box?.width).toBe(main?.width);
    }

    await search.fill('불씨');
    await expect(cards(page)).toHaveCount(2);
    await shot('filtered');

    await search.fill('피자');
    await expect(
      page.getByText("'피자'와 맞는 방송이 없습니다."),
    ).toBeVisible();
    await shot('no-match');
    await page.getByRole('button', { name: '검색어 지우기' }).click();
    await expect(cards(page)).toHaveCount(BROADCASTS.length);
    await expect(search).toBeFocused();
  });
}
