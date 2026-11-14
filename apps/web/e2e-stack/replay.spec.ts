import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  startPublishing,
} from './support';

interface Replay {
  id: string;
  title: string;
  recordingFiles: string[];
}

// reconciler가 30초마다 끝난 파일을 확정하므로, 다시보기는 한 주기에 OME가
// 파일을 마무리하는 시간을 더한 만큼 안에 나타난다.
const SETTLE_MS = 75_000;

async function replays(request: APIRequestContext): Promise<Replay[]> {
  const res = await request.get('/api/replays');
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Replay[];
}

// OME는 출력 스트림이 뜨고(LL-HLS playlist가 나타나는 순간과 같다) 첫 키프레임이
// 지나야 파일을 쓰기 시작한다. 송출 허가 뒤 몇 초가 걸리고, 부하가 있으면
// 더 늦다. 그 전에 끊긴 연결은 파일을 남기지 않으므로, 연결마다
// 한동안 녹화될 때까지
// 유지한다.
async function holdUntilRecorded(request: APIRequestContext, id: string) {
  await expect
    .poll(async () => (await request.get(`/app/${id}/llhls.m3u8`)).status(), {
      timeout: 60_000,
      intervals: [1000],
    })
    .toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 8000));
}

async function endBroadcast(request: APIRequestContext, id: string) {
  const res = await request.post(`/api/broadcasts/${id}/end`);
  expect(res.status(), await res.text()).toBe(200);
}

test('an ended broadcast is listed as a replay and plays every part', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const api = page.context().request;
  await signUpAndLogIn(api);
  const title = `다시보기 ${Date.now()}`;
  const id = await createBroadcast(api, title);

  await startPublishing(page, id);
  await holdUntilRecorded(api, id);
  // 유예 시간 안에 새로고침하면 같은 방송에 다시 연결된다. OME는
  // 녹화 작업을 유지하고 두 번째 연결을 새 파일에 쓴다.
  await page.reload();
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });
  await holdUntilRecorded(api, id);
  const endedAt = Date.now();
  await endBroadcast(api, id);

  let replay: Replay | undefined;
  await expect
    .poll(
      async () => {
        replay = (await replays(api)).find((r) => r.id === id);
        return replay?.recordingFiles.length ?? 0;
      },
      { timeout: SETTLE_MS, intervals: [2000] },
    )
    .toBe(2);
  console.log(
    `end → listed as a replay in ${((Date.now() - endedAt) / 1000).toFixed(1)} s: ${replay?.recordingFiles.join(', ')}`,
  );

  const [first, second] = replay?.recordingFiles ?? [];
  for (const file of [first, second]) {
    const whole = await api.get(`/recordings/${file}`);
    expect(whole.status()).toBe(200);
    expect(whole.headers()['content-type']).toBe('video/mp4');
    const range = await api.get(`/recordings/${file}`, {
      headers: { Range: 'bytes=0-99' },
    });
    expect(range.status()).toBe(206);
  }

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto('/?status=REPLAY');
  await viewer.getByRole('link', { name: new RegExp(title) }).click();
  const video = viewer.getByLabel('다시보기 화면');
  await expect(video).toHaveAttribute('src', `/recordings/${first}`);
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 15_000,
    })
    .toBeGreaterThan(1);
  const size = await video.evaluate((v: HTMLVideoElement) => [
    v.videoWidth,
    v.duration,
  ]);
  console.log(`part 1 plays: width ${size[0]}, duration ${size[1]} s`);
  expect(size[0]).toBeGreaterThan(0);
  await screenshot(viewer, 'replay-playing');

  // 끝 근처로 seek하면 플레이어가 스스로 part 2로 넘어간다.
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = Math.max(0, v.duration - 0.5);
  });
  await expect(video).toHaveAttribute('src', `/recordings/${second}`, {
    timeout: 15_000,
  });
  await expect(viewer.getByRole('button', { name: '2부' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 15_000,
    })
    .toBeGreaterThan(1);
  await viewerContext.close();
});

test('a broadcast that never sent media is not listed as a replay', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const api = page.context().request;
  await signUpAndLogIn(api);
  const title = `녹화 없음 ${Date.now()}`;
  const id = await createBroadcast(api, title);

  // Admission Webhook이 토큰을 허가해 방송은 LIVE가 되지만, OME가 쓸 수 있는
  // offer를 받지 못해 스트림도 파일도 끝내 생기지 않는다.
  const ticket = await api.post(`/api/broadcasts/${id}/publish-token`);
  expect(ticket.status(), await ticket.text()).toBe(201);
  const { publishUrl } = (await ticket.json()) as { publishUrl: string };
  const whip = await api.post(publishUrl, {
    headers: { 'Content-Type': 'application/sdp' },
    data: 'v=0\r\n',
  });
  console.log(`WHIP with an unusable offer → ${whip.status()}`);
  const detail = await api.get(`/api/broadcasts/${id}`);
  const { status } = (await detail.json()) as { status: string };
  console.log(`broadcast after the WHIP request: ${status}`);
  if (status === 'LIVE') await endBroadcast(api, id);

  // 확정할 것이 없는 채로 종료 뒤 reconcile 한 주기를 다 기다린다.
  await page.waitForTimeout(40_000);
  expect((await replays(api)).map((r) => r.id)).not.toContain(id);
  await page.goto('/?status=REPLAY');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(
    0,
  );
});
