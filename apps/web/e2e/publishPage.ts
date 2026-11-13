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
 * API 서버 없이 송출 페이지의 API 호출에 응답한다. 토큰 요청에는
 * 끝내 응답하지 않으므로 "방송 시작"을 누르면 페이지가 캡처를 켠 채 연결 중에
 * 머문다. 이 테스트들이 보는 것은 그것뿐이다.
 */
export async function mockPublishApi(context: BrowserContext) {
  await context.route('**/api/**', (route) => route.fulfill({ status: 404 }));
  await context.route('**/api/auth/me', (route) => route.fulfill({ json: me }));
  await context.route('**/api/broadcasts/b1', (route) =>
    route.fulfill({ json: broadcast }),
  );
  await context.route('**/api/broadcasts/b1/publish-token', () => {});
}
