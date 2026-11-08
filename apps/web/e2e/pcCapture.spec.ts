import { expect, test, type Page } from '@playwright/test';
import { TONE_TAB_TITLE } from '../playwright.config';

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
  await context.route('**/e2e-tone', (route) =>
    route.fulfill({ contentType: 'text/html', body: TONE_PAGE }),
  );
  const tone = await context.newPage();
  await tone.goto('/e2e-tone');

  const page = await context.newPage();
  await page.addInitScript(recordAcquiredTracks);
  await page.goto('/studio/pc');
  await page.getByRole('button', { name: '화면 선택' }).click();
  // Chrome focuses the captured tab after getDisplayMedia. A streamer returns
  // to the studio tab before pressing anything, so do the same. Left in the
  // background, headless Chrome on Linux drops the studio page to a few
  // animation frames per second and the meters miss the fake mic's short
  // beeps, and a second getDisplayMedia from the unfocused document rejects
  // with InvalidStateError.
  await expect(page.getByRole('button', { name: '방송 시작' })).toBeVisible();
  await page.bringToFront();
  await page.getByRole('button', { name: '방송 시작' }).click();

  await expect(page.getByText('화면 소리 있음 · 오디오 동작 중')).toBeVisible();
  const before = await outputTracks(page);
  expect(before.audio).toBe(1);
  expect(before.video).toHaveLength(1);

  await expect
    .poll(() => maxMeterOver(page, '마이크', 1500), {
      message: 'fake mic beep reaches the mic meter',
    })
    .toBeGreaterThan(0.01);
  expect(await outputLevel(page), 'mixed output carries sound').toBeGreaterThan(
    0.01,
  );

  if (!headless) {
    // Headless Chrome has no audio output, so captured tab audio is silent there.
    await expect
      .poll(() => maxMeterOver(page, '화면 소리', 500), {
        message: 'the tone tab reaches the screen meter',
      })
      .toBeGreaterThan(0.01);
  }

  await page.getByRole('button', { name: '마이크 끄기' }).click();
  // Let the analyser's 2048-sample window drain the audio from before the mute.
  await page.waitForTimeout(200);
  expect(
    await maxMeterOver(page, '마이크', 1500),
    'muted mic meter stays near zero',
  ).toBeLessThan(0.001);
  await page.getByRole('button', { name: '마이크 켜기' }).click();

  if (SCREENSHOT_DIR) {
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/studio-pc-${headless ? 'headless' : 'headed'}.png`,
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
  await expect(page.getByText('화면 공유가 끝났습니다.')).toBeVisible();
  const states = await page.evaluate(() =>
    window.acquiredTracks.map((t) => `${t.kind}:${t.label}:${t.readyState}`),
  );
  // mic, first screen video + audio, reselected video + audio, output video + mixed audio
  expect(states).toHaveLength(7);
  for (const state of states) expect(state).toMatch(/:ended$/);
});
