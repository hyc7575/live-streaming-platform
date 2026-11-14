import { expect, test, type Page } from '@playwright/test';
import { TONE_TAB_TITLE } from '../playwright.config';
import { mockPublishApi, PUBLISH_PAGE } from './publishPage';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

const TONE_PAGE = `<!doctype html><title>${TONE_TAB_TITLE}</title>
<p>440Hz</p>
<script>
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.connect(ctx.destination);
  osc.start();
</script>`;

declare global {
  interface Window {
    acquiredTracks: MediaStreamTrack[];
  }
}

function recordAcquiredTracks() {
  window.acquiredTracks = [];
  const devices = navigator.mediaDevices;
  for (const name of ['getUserMedia', 'getDisplayMedia'] as const) {
    const original = devices[name].bind(devices);
    devices[name] = async (options?: MediaStreamConstraints) => {
      const stream = await original(options);
      window.acquiredTracks.push(...stream.getTracks());
      return stream;
    };
  }
}

function outputTracks(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    const stream = video?.srcObject as MediaStream;
    return {
      audio: stream.getAudioTracks().length,
      video: stream.getVideoTracks().map((t) => t.id),
    };
  });
}

function meterValue(page: Page, label: string) {
  return page
    .getByLabel(label)
    .evaluate((meter: HTMLMeterElement) => meter.value);
}

async function maxMeterOver(page: Page, label: string, ms: number) {
  let max = 0;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    max = Math.max(max, await meterValue(page, label));
    await page.waitForTimeout(50);
  }
  return max;
}

function outputLevel(page: Page) {
  return page.evaluate(async () => {
    const stream = (document.querySelector('video')?.srcObject ??
      null) as MediaStream;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx
      .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
      .connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    let max = 0;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 50));
      analyser.getFloatTimeDomainData(buffer);
      max = Math.max(max, ...buffer.map(Math.abs));
    }
    await ctx.close();
    return max;
  });
}

test('mixes screen and mic into one track and stops everything when sharing ends', async ({
  context,
  headless,
}) => {
  await mockPublishApi(context);
  await context.route('**/e2e-tone', (route) =>
    route.fulfill({ contentType: 'text/html', body: TONE_PAGE }),
  );
  const tone = await context.newPage();
  await tone.goto('/e2e-tone');

  const page = await context.newPage();
  await page.addInitScript(recordAcquiredTracks);
  await page.goto(PUBLISH_PAGE);
  await page.getByRole('button', { name: '화면 공유' }).click();
  // Chrome은 getDisplayMedia 뒤 캡처한 탭에 포커스를 준다. 스트리머는
  // 무엇을 누르기 전에 스튜디오 탭으로 돌아오므로 테스트도 그렇게 한다.
  // 백그라운드에 두면 Linux의 headless Chrome이 스튜디오 페이지를 초당
  // 몇 애니메이션 프레임으로 떨어뜨려 미터가 가짜 마이크의 짧은 삐 소리를
  // 놓친다. 포커스 없는 문서에서 부른 두 번째 getDisplayMedia도
  // InvalidStateError로 거부된다.
  await expect(page.getByRole('button', { name: '방송 시작' })).toBeVisible();
  await page.bringToFront();
  await page.getByRole('button', { name: '방송 시작' }).click();

  await expect(page.getByText('송출을 연결하는 중입니다.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const before = await outputTracks(page);
  expect(before.audio).toBe(1);
  expect(before.video).toHaveLength(1);

  await expect
    .poll(() => maxMeterOver(page, '마이크', 1500), {
      // 미터는 믹서의 AudioContext로 읽으므로, 이 검사는 "방송 시작"이
      // AudioContext를 재개했다는 것도 증명한다.
      message: 'fake mic beep reaches the mic meter',
    })
    .toBeGreaterThan(0.01);
  expect(await outputLevel(page), 'mixed output carries sound').toBeGreaterThan(
    0.01,
  );

  if (!headless) {
    // headless Chrome에는 오디오 출력이 없어 캡처한 탭 오디오가 무음이다.
    await expect
      .poll(() => maxMeterOver(page, '화면 소리', 500), {
        message: 'the tone tab reaches the screen meter',
      })
      .toBeGreaterThan(0.01);
  }

  await page.getByRole('button', { name: '마이크 끄기' }).click();
  // analyser의 2048샘플 창에서 음소거 전 오디오가 빠져나가기를 기다린다.
  await page.waitForTimeout(200);
  expect(
    await maxMeterOver(page, '마이크', 1500),
    'muted mic meter stays near zero',
  ).toBeLessThan(0.001);
  await page.getByRole('button', { name: '마이크 켜기' }).click();

  if (SCREENSHOT_DIR) {
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/publish-screen-${headless ? 'headless' : 'headed'}.png`,
    });
  }

  await page.getByRole('button', { name: '다시 선택' }).click();
  await expect
    .poll(async () => (await outputTracks(page)).video[0])
    .not.toBe(before.video[0]);
  const after = await outputTracks(page);
  expect(after.audio).toBe(1);
  expect(after.video).toHaveLength(1);

  await page.evaluate(() => {
    const stream = document.querySelector('video')?.srcObject as MediaStream;
    window.acquiredTracks.push(...stream.getTracks());
  });
  await tone.close();
  await expect(page.getByRole('alert')).toHaveText(
    '화면 공유가 중지되었습니다.',
  );
  const states = await page.evaluate(() =>
    window.acquiredTracks.map((t) => `${t.kind}:${t.label}:${t.readyState}`),
  );
  // 마이크, 첫 화면 영상 + 오디오, 다시 고른 영상 + 오디오, 출력 영상 + 믹스한 오디오
  expect(states).toHaveLength(7);
  for (const state of states) expect(state).toMatch(/:ended$/);
});
