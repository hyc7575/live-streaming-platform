import { expect, test, type Locator, type Page } from '@playwright/test';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;
const ME = { id: 'u-viewer', nickname: '시청자' };
const AT = '2026-11-11T10:00:00.000Z';

function broadcast(status: 'LIVE' | 'ENDED') {
  return {
    id: 'b1',
    title: '패널 높이 확인',
    description: '',
    status,
    startedAt: AT,
    endedAt: status === 'ENDED' ? AT : null,
    disconnectedAt: null,
    createdAt: AT,
    recordingFiles: status === 'ENDED' ? ['b1.mp4'] : [],
    recordingParts:
      status === 'ENDED' ? [{ file: 'b1.mp4', startedAt: AT }] : [],
    thumbnailUrl: null,
    standbyImageUrl: null,
    streamer: { id: 'u-streamer', nickname: '방송인' },
  };
}

function messages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${String(i).padStart(4, '0')}`,
    body: `채팅 ${i}`,
    createdAt: AT,
    updatedAt: AT,
    author: { id: 'u-other', nickname: '다른 시청자' },
  }));
}

async function openBroadcast(
  page: Page,
  status: 'LIVE' | 'ENDED',
  count: number,
) {
  await page.route('**/api/**', (route) => route.fulfill({ status: 404 }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: ME }));
  await page.route('**/api/broadcasts/b1', (route) =>
    route.fulfill({ json: broadcast(status) }),
  );
  await page.route('**/api/broadcasts/b1/donations', (route) =>
    route.fulfill({ json: { total: 0, count: 0, donations: [] } }),
  );
  // 채팅은 `after` 커서로 폴링한다. 첫 읽기에만 메시지가 있다.
  await page.route('**/api/broadcasts/b1/chat**', (route) =>
    route.fulfill({
      json: route.request().url().includes('after=') ? [] : messages(count),
    }),
  );
  await page.route('**/api/broadcasts/b1/comments', (route) =>
    route.fulfill({ json: messages(count) }),
  );
  await page.goto('/broadcasts/b1');
  await expect(
    page.getByRole('heading', { name: '패널 높이 확인' }),
  ).toBeVisible();
}

// 패널의 각 화면: 목록을 담은 영역과 폼.
const VIEWS = [
  { name: 'live chat', status: 'LIVE', tab: null, form: '채팅 쓰기' },
  { name: 'comments', status: 'ENDED', tab: '댓글', form: '댓글 쓰기' },
  { name: 'chat log', status: 'ENDED', tab: '채팅 기록', form: null },
] as const;

async function openView(
  page: Page,
  view: (typeof VIEWS)[number],
  count: number,
): Promise<Locator> {
  await openBroadcast(page, view.status, count);
  const panel = page.getByRole('complementary', {
    name: view.status === 'LIVE' ? '채팅' : '댓글과 채팅 기록',
    exact: true,
  });
  if (view.tab) await page.getByRole('tab', { name: view.tab }).click();
  const shown =
    count === 0
      ? panel
      : panel.locator('ol:visible').getByText(`채팅 ${count - 1}`);
  await expect(shown).toBeVisible();
  return panel;
}

async function layout(page: Page, panel: Locator, form: string | null) {
  const box = (await panel.boundingBox())!;
  const formBox = form ? await page.getByLabel(form).boundingBox() : null;
  const pageHeight = await page.evaluate(
    () => document.scrollingElement!.scrollHeight,
  );
  return {
    top: box.y,
    bottom: box.y + box.height,
    formBottom: formBox && formBox.y + formBox.height,
    pageHeight,
  };
}

test.describe('wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const view of VIEWS) {
    test(`the ${view.name} panel fills the screen height whether empty or full`, async ({
      page,
    }) => {
      const empty = await layout(
        page,
        await openView(page, view, 0),
        view.form,
      );
      const full = await layout(
        page,
        await openView(page, view, 200),
        view.form,
      );

      expect(
        full,
        'the panel and its form do not move with the message count',
      ).toEqual(empty);
      expect(
        empty.bottom,
        'the panel reaches near the bottom of the screen',
      ).toBeGreaterThan(800 - 48);

      const list = page.locator('aside ol:visible');
      const scroll = await list.evaluate((el) => ({
        overflows: el.scrollHeight > el.clientHeight,
        overflowY: getComputedStyle(el).overflowY,
      }));
      expect(scroll, 'only the list scrolls').toEqual({
        overflows: true,
        overflowY: 'auto',
      });

      if (SCREENSHOT_DIR && view.name !== 'comments')
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/wide-${view.name.replace(' ', '-')}.png`,
        });
    });
  }
});
