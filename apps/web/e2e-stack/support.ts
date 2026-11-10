import { expect, type APIRequestContext, type Page } from '@playwright/test';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

export interface BroadcastView {
  id: string;
  status: 'READY' | 'LIVE' | 'ENDED';
  startedAt: string | null;
  endedAt: string | null;
  thumbnailUrl: string | null;
}

let clientCounter = 0;

// Signup is rate limited per client IP. The API trusts one proxy hop, and
// the Vite proxy adds none, so a fresh forwarded address per run keeps
// repeated local runs under the limit.
export function clientIp(): string {
  clientCounter += 1;
  const n = (Date.now() + clientCounter) % 250;
  return `10.99.${clientCounter % 250}.${n + 1}`;
}

export interface Account {
  id: string;
  nickname: string;
  email: string;
  password: string;
}

// Signup does not log in, so the account can be used from another context.
export async function signUp(
  request: APIRequestContext,
  nickname = '송출 확인',
): Promise<Account> {
  const email = `stack-${Date.now()}-${clientCounter}@example.com`;
  const password = 'correct-horse-battery';
  const signup = await request.post('/api/auth/signup', {
    headers: { 'X-Forwarded-For': clientIp() },
    data: { email, password, nickname },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  const user = (await signup.json()) as { id: string };
  return { id: user.id, nickname, email, password };
}

export async function signUpAndLogIn(
  request: APIRequestContext,
  nickname?: string,
): Promise<Account> {
  const account = await signUp(request, nickname);
  const login = await request.post('/api/auth/login', {
    headers: { 'X-Forwarded-For': clientIp() },
    data: { email: account.email, password: account.password },
  });
  expect(login.status(), await login.text()).toBe(200);
  return account;
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
