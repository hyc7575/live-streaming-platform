import type { BrowserContext } from '@playwright/test';

export const PUBLISH_PAGE = '/studio/broadcasts/b1';

const me = { id: 'u1', email: 'e2e@example.com', nickname: '불씨' };

const broadcast = {
  id: 'b1',
  title: '화면 공유 점검',
  description: '',
  status: 'READY',
  startedAt: null,
  endedAt: null,
  createdAt: '2026-11-10T00:00:00.000Z',
  streamer: { id: me.id, nickname: me.nickname },
};

/**
 * Answers the publish page's API calls without the API server. The token
 * request never gets an answer, so "방송 시작" leaves the page connecting
 * with the capture running, which is all these tests look at.
 */
export async function mockPublishApi(context: BrowserContext) {
  await context.route('**/api/**', (route) => route.fulfill({ status: 404 }));
  await context.route('**/api/auth/me', (route) => route.fulfill({ json: me }));
  await context.route('**/api/broadcasts/b1', (route) =>
    route.fulfill({ json: broadcast }),
  );
  await context.route('**/api/broadcasts/b1/publish-token', () => {});
}
