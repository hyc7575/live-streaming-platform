import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

interface BroadcastView {
  id: string;
  status: 'READY' | 'LIVE' | 'ENDED';
}

let clientCounter = 0;

// Signup is rate limited per client IP. The API trusts one proxy hop, and
// the Vite proxy adds none, so a fresh forwarded address per run keeps
// repeated local runs under the limit.
function clientIp(): string {
  clientCounter += 1;
  const n = (Date.now() + clientCounter) % 250;
  return `10.99.${clientCounter % 250}.${n + 1}`;
}

async function signUpAndLogIn(request: APIRequestContext): Promise<void> {
  const email = `stack-${Date.now()}-${clientCounter}@example.com`;
  const password = 'correct-horse-battery';
  const headers = { 'X-Forwarded-For': clientIp() };
  const signup = await request.post('/api/auth/signup', {
    headers,
    data: { email, password, nickname: '송출 확인' },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  const login = await request.post('/api/auth/login', {
    headers,
    data: { email, password },
  });
  expect(login.status(), await login.text()).toBe(200);
}

async function createBroadcast(
  request: APIRequestContext,
  title: string,
): Promise<string> {
  const res = await request.post('/api/broadcasts', { data: { title } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as BroadcastView).id;
}

async function statusOf(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/broadcasts/${id}`);
  return ((await res.json()) as BroadcastView).status;
}

async function screenshot(page: Page, name: string) {
  if (SCREENSHOT_DIR) {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
  }
}

test('a published camera reaches an anonymous viewer over LL-HLS', async ({
  page,
  browser,
}) => {
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '송출에서 시청까지');

  await page.goto(`/studio/broadcasts/${id}`);
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => statusOf(page.request, id), { timeout: 10_000 })
    .toBe('LIVE');
  await screenshot(page, 'publish-live');

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  const video = viewer.getByLabel('방송 화면');
  // The playlist 404s for about 9.5 s after the publish connects.
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 60_000,
    })
    .toBeGreaterThan(1);
  const playback = await video.evaluate((v: HTMLVideoElement) => ({
    width: v.videoWidth,
    height: v.videoHeight,
    start: v.currentTime,
    src: v.src,
  }));
  // hls.js plays through MediaSource, so the element holds a blob: URL.
  expect(playback.src).toMatch(/^blob:/);
  expect(playback.width).toBeGreaterThan(0);
  expect(playback.height).toBeGreaterThan(0);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(playback.start + 1);
  await expect(viewer.getByText('방송을 불러오는 중입니다')).toBeHidden();
  await screenshot(viewer, 'viewer-playing');
  await viewerContext.close();

  const second = await createBroadcast(page.request, '두 번째 방송');
  const secondPage = await page.context().newPage();
  await secondPage.goto(`/studio/broadcasts/${second}`);
  await secondPage.getByRole('button', { name: '카메라 켜기' }).click();
  await secondPage.getByRole('button', { name: '방송 시작' }).click();
  await expect(secondPage.getByRole('alert')).toHaveText(
    '기존 방송을 종료하세요.',
  );
  await secondPage.close();

  await page.getByRole('button', { name: '송출 중지' }).click();
  await expect(page.getByRole('button', { name: '카메라 켜기' })).toBeVisible();
});

test('OME refuses a publish without a valid token', async ({ page }) => {
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '거절 확인');
  const other = await createBroadcast(page.request, '다른 방송');
  const issued = await page.request.post(
    `/api/broadcasts/${other}/publish-token`,
  );
  expect(issued.status()).toBe(201);
  const { publishUrl } = (await issued.json()) as { publishUrl: string };
  const otherToken = new URL(publishUrl, 'http://x').searchParams.get('token');

  for (const token of [null, 'not-a-real-token', otherToken]) {
    const query = token ? `&token=${token}` : '';
    const res = await page.request.post(
      `/app/${id}?direction=whip&transport=all${query}`,
      {
        headers: { 'Content-Type': 'application/sdp' },
        data: 'v=0\r\n',
      },
    );
    expect(res.status(), `token=${token}`).toBe(401);
  }
  expect(await statusOf(page.request, id)).toBe('READY');
  expect(await statusOf(page.request, other)).toBe('READY');
});
