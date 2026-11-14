import { expect, test } from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  startPublishing,
  watchUntilPlaying,
} from './support';

// 종료 때까지 시청 페이지를 열어 둔 시청자는 reconciler(30초 주기)가 파일을
// 확정하면 새로고침 없이 다시보기를 받는다.
// 페이지는 endedAt 뒤 최대 90초 기다린다(BroadcastPage REPLAY_WAIT_MS).
test('a viewer who stays on the page gets the replay after the end', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const api = page.context().request;
  await signUpAndLogIn(api);
  const id = await createBroadcast(api, `종료 뒤 다시보기 ${Date.now()}`);
  await startPublishing(page, id);

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);
  // OME는 스트림이 뜨고 키프레임이 지나야 파일을 쓴다.
  await viewer.waitForTimeout(8000);

  const end = await api.post(`/api/broadcasts/${id}/end`);
  expect(end.status(), await end.text()).toBe(200);
  const endedAt = Date.now();

  // 다시보기 안내도 이 문장으로 시작하므로 둘 다 맞는다.
  await expect(viewer.getByText(/^방송이 끝났습니다\./)).toBeVisible({
    timeout: 15_000,
  });
  // 페이지가 다음에 읽기 전에 reconciler가 돌면, 페이지는 곧바로 다시보기로 가고
  // 기다림 안내 줄을 보이지 않는다.
  const preparing = viewer.getByText('다시보기를 준비하는 중입니다.');
  if (await preparing.isVisible()) await screenshot(viewer, 'replay-preparing');

  await expect(viewer.getByLabel('다시보기 화면')).toBeVisible({
    timeout: 90_000,
  });
  console.log(
    `end → replay player on the open page in ${((Date.now() - endedAt) / 1000).toFixed(1)} s`,
  );
  await expect(viewer.getByText('다시보기를 준비하는 중입니다.')).toHaveCount(
    0,
  );
  await screenshot(viewer, 'replay-after-end');
  await viewerContext.close();
});
