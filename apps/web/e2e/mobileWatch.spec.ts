import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;
const WIDTH = 390;
const HEIGHT = 844;
const AT = '2026-11-11T10:00:00.000Z';
const STREAMER = { id: 'u-streamer', nickname: '방송인' };
const VIEWER = { id: 'u-viewer', nickname: '시청자' };

type Status = 'READY' | 'LIVE' | 'ENDED';
type Who = 'anonymous' | 'viewer' | 'owner';

function broadcast(status: Status, files: string[], title: string) {
  return {
    id: 'b1',
    title,
    description: '오늘은 보드게임을 합니다.',
    status,
    startedAt: status === 'READY' ? null : AT,
    endedAt: status === 'ENDED' ? AT : null,
    disconnectedAt: null,
    createdAt: AT,
    recordingFiles: files,
    recordingParts: files.map((file) => ({ file, startedAt: AT })),
    thumbnailUrl: null,
    standbyImageUrl: null,
    streamer: STREAMER,
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
  {
    status,
    count = 0,
    who = 'viewer',
    files = status === 'ENDED' ? ['b1/1_0.mp4'] : [],
    title = '모바일 시청 확인',
  }: {
    status: Status;
    count?: number;
    who?: Who;
    files?: string[];
    title?: string;
  },
) {
  await page.route('**/api/**', (route) => route.fulfill({ status: 404 }));
  await page.route('**/recordings/**', (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.route('**/api/auth/me', (route) =>
    who === 'anonymous'
      ? route.fulfill({ status: 401 })
      : route.fulfill({ json: who === 'owner' ? STREAMER : VIEWER }),
  );
  await page.route('**/api/me/follows', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/broadcasts/b1', (route) =>
    route.fulfill({ json: broadcast(status, files, title) }),
  );
  await page.route('**/api/broadcasts/b1/donations', (route) =>
    route.fulfill({ json: { total: 0, count: 0, donations: [] } }),
  );
  // Chat polls with an `after` cursor; only the first read has messages.
  await page.route('**/api/broadcasts/b1/chat**', (route) =>
    route.fulfill({
      json: route.request().url().includes('after=') ? [] : messages(count),
    }),
  );
  await page.route('**/api/broadcasts/b1/comments', (route) =>
    route.fulfill({ json: messages(count) }),
  );
  await page.goto('/broadcasts/b1');
  await expect(page.getByRole('button', { name: '더 보기' })).toBeVisible();
}

// Each view of the panel and the form at its bottom, if it has one.
const VIEWS = [
  { name: 'live-chat', status: 'LIVE', tab: null, form: '채팅 쓰기' },
  { name: 'ready-chat', status: 'READY', tab: null, form: '채팅 쓰기' },
  { name: 'ended-comments', status: 'ENDED', tab: '댓글', form: '댓글 쓰기' },
  { name: 'ended-chat-log', status: 'ENDED', tab: '채팅 기록', form: null },
] as const;

async function openView(
  page: Page,
  view: (typeof VIEWS)[number],
  count: number,
) {
  await openBroadcast(page, { status: view.status, count });
  if (view.tab) await page.getByRole('tab', { name: view.tab }).click();
  const panel = page.locator('section aside');
  await expect(
    count === 0
      ? panel
      : panel.locator('ol:visible').getByText(`채팅 ${count - 1}`),
  ).toBeVisible();
}

async function layout(page: Page, form: string | null) {
  const box = async (selector: string) => {
    const b = (await page.locator(selector).first().boundingBox())!;
    return { top: b.y, bottom: b.y + b.height };
  };
  const formBox = form
    ? await page.getByLabel(form).locator('xpath=ancestor::form').boundingBox()
    : null;
  return {
    player: await box('section > div > :first-child'),
    summary: await box('h1'),
    panel: await box('section aside'),
    formBottom: formBox && formBox.y + formBox.height,
    page: await page.evaluate(() => ({
      scrollHeight: document.scrollingElement!.scrollHeight,
      innerHeight,
    })),
  };
}

test.describe('narrow screen', () => {
  test.use({ viewport: { width: WIDTH, height: HEIGHT } });

  for (const view of VIEWS) {
    test(`${view.name} fills the screen with the player, summary and panel whether empty or full`, async ({
      page,
    }) => {
      await openView(page, view, 0);
      const empty = await layout(page, view.form);
      await openView(page, view, 200);
      const full = await layout(page, view.form);

      expect(full, 'nothing moves with the message count').toEqual(empty);
      expect(empty.page, 'the page does not scroll').toEqual({
        scrollHeight: HEIGHT,
        innerHeight: HEIGHT,
      });
      expect(
        empty.panel.bottom,
        'the panel reaches the bottom of the screen',
      ).toBeGreaterThan(HEIGHT - 16);
      if (empty.formBottom !== null)
        expect(
          empty.formBottom,
          'the form sits at the bottom of the screen',
        ).toBeGreaterThan(HEIGHT - 32);

      const list = page.locator('section aside ol:visible');
      expect(
        await list.evaluate((el) => ({
          overflows: el.scrollHeight > el.clientHeight,
          overflowY: getComputedStyle(el).overflowY,
          atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
        })),
        'only the list scrolls, and it starts at the newest message',
      ).toEqual({ overflows: true, overflowY: 'auto', atBottom: true });

      if (
        SCREENSHOT_DIR &&
        (view.name === 'live-chat' || view.name === 'ended-chat-log')
      )
        await page.screenshot({ path: `${SCREENSHOT_DIR}/${view.name}.png` });
    });
  }

  test('hides 보내기 and sends chat on Enter', async ({ page }) => {
    await openBroadcast(page, { status: 'LIVE' });
    let sent: unknown = null;
    await page.route('**/api/broadcasts/b1/chat', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      sent = route.request().postDataJSON();
      return route.fulfill({
        json: { ...messages(1)[0], body: '안녕하세요', id: 'mine' },
      });
    });
    await expect(page.getByRole('button', { name: '보내기' })).toBeHidden();
    await page.getByLabel('채팅 쓰기').fill('안녕하세요');
    await page.getByLabel('채팅 쓰기').press('Enter');
    await expect(
      page.locator('section aside ol').getByText('안녕하세요'),
    ).toBeVisible();
    expect(sent).toEqual({ body: '안녕하세요' });
    await expect(page.getByLabel('채팅 쓰기')).toHaveValue('');
  });

  const SHEETS: {
    who: Who;
    status: Status;
    shown: string[];
    hidden: string[];
  }[] = [
    {
      who: 'anonymous',
      status: 'LIVE',
      shown: ['로그인하고 후원해 보세요'],
      hidden: ['후원하기', '송출 화면', '방송 종료', '수정', '삭제'],
    },
    {
      who: 'viewer',
      status: 'LIVE',
      shown: ['후원하기'],
      hidden: ['송출 화면', '방송 종료', '수정', '삭제'],
    },
    {
      who: 'viewer',
      status: 'READY',
      shown: [],
      hidden: ['후원하기', '송출 화면', '방송 종료', '수정', '삭제'],
    },
    {
      who: 'owner',
      status: 'LIVE',
      shown: ['송출 화면', '방송 종료', '수정', '삭제'],
      hidden: ['후원하기'],
    },
  ];

  for (const [i, c] of SHEETS.entries()) {
    const close = i % 2 === 0 ? 'Esc' : 'a tap on the backdrop';
    test(`the 더 보기 sheet shows a ${c.status} broadcast's details to the ${c.who}, and ${close} closes it`, async ({
      page,
    }) => {
      await openBroadcast(page, { status: c.status, who: c.who });
      const more = page.getByRole('button', { name: '더 보기' });
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await more.click();
      const sheet = page.getByRole('dialog', { name: '모바일 시청 확인' });
      await expect(sheet).toBeVisible();
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      await expect(sheet.getByText('오늘은 보드게임을 합니다.')).toBeVisible();
      await expect(sheet.getByRole('heading', { name: '후원' })).toBeVisible();
      for (const name of c.shown)
        await expect(
          sheet
            .getByRole('link', { name })
            .or(sheet.getByRole('button', { name })),
        ).toBeVisible();
      for (const name of c.hidden)
        await expect(
          page
            .getByRole('link', { name, exact: true })
            .or(page.getByRole('button', { name, exact: true })),
        ).toHaveCount(0);

      const sheetBox = (await sheet.boundingBox())!;
      expect(
        sheetBox.y + sheetBox.height,
        'the sheet sits on the bottom edge',
      ).toBeCloseTo(HEIGHT, 0);
      if (SCREENSHOT_DIR && c.who === 'viewer' && c.status === 'LIVE')
        await page.screenshot({ path: `${SCREENSHOT_DIR}/sheet-open.png` });

      if (close === 'Esc') await page.keyboard.press('Escape');
      else await page.mouse.click(WIDTH / 2, 20);
      await expect(sheet).toBeHidden();
      await expect(more).toBeFocused();
      await expect(more).toHaveAttribute('aria-expanded', 'false');
    });
  }

  test('picking 2부 in the sheet plays it and closes the sheet', async ({
    page,
  }) => {
    await openBroadcast(page, {
      status: 'ENDED',
      files: ['b1/1_0.mp4', 'b1/1_1.mp4'],
    });
    const video = page.getByLabel('다시보기 화면');
    await expect(video).toHaveAttribute('src', '/recordings/b1/1_0.mp4');
    await page.getByRole('button', { name: '더 보기' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: '2부' }).click();
    await expect(sheet).toBeHidden();
    await expect(video).toHaveAttribute('src', '/recordings/b1/1_1.mp4');
  });
});

test.describe('360px wide', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the summary line fits a long title, the clock and the login link', async ({
    page,
  }) => {
    await openBroadcast(page, {
      status: 'LIVE',
      who: 'anonymous',
      title: '아주 긴 방송 제목이 요약 줄을 넘치게 하는지 확인합니다',
    });
    await expect(
      page.getByRole('link', { name: '로그인하고 팔로우' }),
    ).toBeVisible();
    const more = (await page
      .getByRole('button', { name: '더 보기' })
      .boundingBox())!;
    expect(more.x + more.width, '더 보기 stays on screen').toBeLessThanOrEqual(
      360,
    );
    expect(
      await page.evaluate(() => ({
        pageWidth: document.scrollingElement!.scrollWidth,
        titleCut: (() => {
          const h1 = document.querySelector('h1')!;
          return h1.scrollWidth > h1.clientWidth;
        })(),
      })),
    ).toEqual({ pageWidth: 360, titleCut: true });
  });
});
