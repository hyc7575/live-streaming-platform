import { expect, type APIRequestContext, type Page } from '@playwright/test';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

export interface BroadcastView {
  id: string;
  status: 'READY' | 'LIVE' | 'ENDED';
  startedAt: string | null;
  endedAt: string | null;
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

export async function signUpAndLogIn(
  request: APIRequestContext,
): Promise<void> {
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

export async function createBroadcast(
  request: APIRequestContext,
  title: string,
): Promise<string> {
  const res = await request.post('/api/broadcasts', { data: { title } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as BroadcastView).id;
}

export async function detailOf(
  request: APIRequestContext,
  id: string,
): Promise<BroadcastView> {
  const res = await request.get(`/api/broadcasts/${id}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as BroadcastView;
}

export async function statusOf(request: APIRequestContext, id: string) {
  return (await detailOf(request, id)).status;
}

export async function startPublishing(page: Page, id: string) {
  await page.goto(`/studio/broadcasts/${id}`);
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });
}

export async function screenshot(page: Page, name: string) {
  if (SCREENSHOT_DIR) {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
  }
}

export async function watchUntilPlaying(viewer: Page) {
  const video = viewer.getByLabel('방송 화면');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 60_000,
    })
    .toBeGreaterThan(1);
}
