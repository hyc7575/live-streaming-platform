import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createBroadcast, detailOf, signUpAndLogIn } from './support';
import { installWallClockCamera, wallClockOf } from './wallClock';

// #102: 송출이 연결된 직후 페이지를 연 시청자가 얼마나 기다리는지 잰다.
// 기준은 LIVE 전환 시각이다(startedAt. 이 기기의 시계로 Admission Webhook이
// 기록한다). 표본을 여럿 모으려면 --repeat-each로 돌린다. 실행마다
// `first-frame {...}` 줄을 하나 출력한다.
// master playlist는 media playlist보다 몇 초 먼저 응답한다. OME가 media playlist를
// 첫 세그먼트가 닫힐 때까지 붙잡아 두므로 둘 다 잰다.
// FIRST_FRAME_TRACE_DIR를 주면 시청자마다 요청 로그를 남긴다. 끝내 재생하지
// 못한 실행도 남긴다.
const OME = `http://localhost:${process.env.OME_HTTP_PORT || 3333}`;

test('first frame after the publish connects', async ({ page, browser }) => {
  await installWallClockCamera(page);
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, '첫 화면 대기 측정');

  await page.goto(`/studio/broadcasts/${id}`);
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await page.getByRole('button', { name: '방송 시작' }).click();

  let playlistAt: number | null = null;
  let chunklistAt: number | null = null;
  let notFound = 0;
  const firstOk = async (url: () => string | null) => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const target = url();
      if (target) {
        const res = await fetch(target);
        if (res.status === 200)
          return { at: Date.now(), body: await res.text() };
        notFound += 1;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  };
  const playlist = (async () => {
    const masterUrl = `${OME}/app/${id}/llhls.m3u8`;
    const master = await firstOk(() => masterUrl);
    playlistAt = master?.at ?? null;
    const chunklist = master?.body
      .split('\n')
      .find((line) => line.trim() && !line.startsWith('#'));
    if (!chunklist) return;
    const media = await firstOk(
      () => new URL(chunklist.trim(), masterUrl).href,
    );
    chunklistAt = media?.at ?? null;
  })();

  await expect(page.getByText('송출 중입니다.')).toBeVisible({
    timeout: 30_000,
  });
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.addInitScript(() => {
    document.addEventListener(
      'playing',
      () => {
        const w = window as unknown as { __playingAt?: number };
        w.__playingAt ??= Date.now();
      },
      true,
    );
    document.addEventListener(
      'waiting',
      () => {
        const w = window as unknown as {
          __playingAt?: number;
          __stalls?: number;
        };
        if (w.__playingAt) w.__stalls = (w.__stalls ?? 0) + 1;
      },
      true,
    );
  });
  const requests: string[] = [];
  viewer.on('response', (res) => {
    if (res.url().includes('/app/'))
      requests.push(
        `${Date.now()} ${res.status()} ${new URL(res.url()).pathname.split('/').pop()}`,
      );
  });
  viewer.on('request', (req) => {
    if (req.url().includes('/app/'))
      requests.push(
        `${Date.now()} >>> ${new URL(req.url()).pathname.split('/').pop()}${new URL(req.url()).search}`,
      );
  });
  viewer.on('console', (msg) =>
    requests.push(`${Date.now()} console ${msg.text()}`),
  );
  const traceDir = process.env.FIRST_FRAME_TRACE_DIR;
  const dumpTrace = async (note: string) => {
    if (!traceDir) return;
    const { startedAt } = await detailOf(page.request, id);
    const t0 = Date.parse(startedAt!);
    const lines = requests.map((line) => {
      const [at, ...rest] = line.split(' ');
      return `+${Number(at) - t0} ${rest.join(' ')}`;
    });
    writeFileSync(`${traceDir}/${id}.txt`, [note, ...lines].join('\n'));
  };
  const viewerOpenedAt = Date.now();
  await viewer.goto(`/broadcasts/${id}`);
  let firstFrameAt: number;
  try {
    const playingAt = await viewer.waitForFunction(
      () => (window as unknown as { __playingAt?: number }).__playingAt,
      undefined,
      { timeout: 60_000 },
    );
    firstFrameAt = (await playingAt.jsonValue()) as number;
  } catch (error) {
    await dumpTrace('no playing within 60 s');
    throw error;
  }
  await playlist;

  // KR2는 시작 직후 따라잡는 구간이 아니라 안정 상태의 지연이다.
  await viewer.waitForTimeout(20_000);
  const video = viewer.getByLabel('방송 화면');
  const latencies: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const shown = await wallClockOf(video);
    if (shown !== null) latencies.push(Date.now() - shown);
    await viewer.waitForTimeout(500);
  }
  const stalls = await viewer.evaluate(
    () => (window as unknown as { __stalls?: number }).__stalls ?? 0,
  );
  latencies.sort((a, b) => a - b);

  const { startedAt } = await detailOf(page.request, id);
  expect(startedAt).toBeTruthy();
  expect(playlistAt).not.toBeNull();
  const t0 = Date.parse(startedAt!);
  const result = {
    id,
    playlistMs: playlistAt! - t0,
    chunklistMs: chunklistAt === null ? null : chunklistAt - t0,
    firstFrameMs: firstFrameAt - t0,
    viewerOpenedMs: viewerOpenedAt - t0,
    playlist404s: notFound,
    latencyMs: latencies[Math.floor(latencies.length / 2)] ?? null,
    latencySpreadMs: latencies.length
      ? latencies[latencies.length - 1] - latencies[0]
      : null,
    stallsAfterPlaying: stalls,
  };
  console.log(`first-frame ${JSON.stringify(result)}`);
  await dumpTrace(JSON.stringify(result));
  await viewerContext.close();

  await page.getByRole('button', { name: '방송 종료' }).click();
  await page.getByRole('button', { name: '종료하기' }).click();
  await expect(page.getByText('방송을 종료했습니다.')).toBeVisible();
});
