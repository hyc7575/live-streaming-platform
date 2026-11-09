import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { TONE_TAB_TITLE } from '../playwright.config';
import { mockPublishApi, PUBLISH_PAGE } from './publishPage';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

const NO_SCREEN_AUDIO = '화면 소리가 잡히지 않습니다';
const SILENT_SCREEN = '화면 소리가 아직 들리지 않습니다';
const MIC_LOST = '마이크 연결이 끊겼습니다';

type DisplayAudio = 'drop' | 'silent' | 'tone';

declare global {
  interface Window {
    displayAudioPlan: DisplayAudio[];
    micTracks: MediaStreamTrack[];
  }
}

/**
 * Rewrites the audio of each getDisplayMedia result by the next entry of
 * `window.displayAudioPlan`. 'drop' is a tab shared with "탭 오디오와 함께 공유"
 * turned off; 'tone' stands in for tab audio, which headless Chrome captures
 * as silence.
 */
function controlDisplayAudio() {
  window.displayAudioPlan = [];
  window.micTracks = [];
  const devices = navigator.mediaDevices;
  const getDisplayMedia = devices.getDisplayMedia.bind(devices);
  const getUserMedia = devices.getUserMedia.bind(devices);
  devices.getUserMedia = async (options) => {
    const stream = await getUserMedia(options);
    window.micTracks.push(...stream.getAudioTracks());
    return stream;
  };
  devices.getDisplayMedia = async (options) => {
    const stream = await getDisplayMedia(options);
    const plan = window.displayAudioPlan.shift();
    if (!plan) return stream;
    for (const track of stream.getAudioTracks()) {
      track.stop();
      stream.removeTrack(track);
    }
    if (plan === 'drop') return stream;
    const ctx = new AudioContext();
    const destination = ctx.createMediaStreamDestination();
    if (plan === 'tone') {
      const osc = ctx.createOscillator();
      osc.connect(destination);
      osc.start();
    }
    stream.addTrack(destination.stream.getAudioTracks()[0]);
    return stream;
  };
}

async function openToneTab(context: BrowserContext) {
  await context.route('**/e2e-tone', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>${TONE_TAB_TITLE}</title><p>tab</p>`,
    }),
  );
  const tone = await context.newPage();
  await tone.goto('/e2e-tone');
}

async function openStudio(context: BrowserContext, plan: DisplayAudio[]) {
  await mockPublishApi(context);
  await openToneTab(context);
  const page = await context.newPage();
  await page.addInitScript(controlDisplayAudio);
  await page.goto(PUBLISH_PAGE);
  await page.evaluate((p) => (window.displayAudioPlan = p), plan);
  return page;
}

// Chrome focuses the captured tab after getDisplayMedia. Come back to the
// studio tab as a streamer would; see pcCapture.spec.ts for why CI needs it.
async function pick(page: Page, button: string) {
  await page.getByRole('button', { name: button }).click();
  await expect(page.getByRole('button', { name: '방송 시작' })).toBeVisible();
  await page.bringToFront();
}

async function maxMeterOver(page: Page, label: string, ms: number) {
  let max = 0;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = await page
      .getByLabel(label)
      .evaluate((meter: HTMLMeterElement) => meter.value);
    max = Math.max(max, value);
    await page.waitForTimeout(50);
  }
  return max;
}

async function shot(page: Page, name: string) {
  if (SCREENSHOT_DIR) {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
  }
}

test('warns when the screen has no audio and clears after reselecting a tab with sound', async ({
  context,
}) => {
  const page = await openStudio(context, ['drop', 'tone']);
  await pick(page, '화면 공유');

  await expect(page.getByRole('alert')).toContainText(NO_SCREEN_AUDIO);
  await expect(page.getByRole('alert')).toContainText('탭 오디오와 함께 공유');
  await expect(page.getByRole('button', { name: '다시 선택' })).toBeVisible();
  await shot(page, 'preflight-no-screen-audio');
  await page.setViewportSize({ width: 360, height: 1000 });
  await shot(page, 'preflight-no-screen-audio-360');
  await page.setViewportSize({ width: 1280, height: 720 });

  await pick(page, '다시 선택');
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('button', { name: '방송 시작' }).click();
  await expect
    .poll(() => maxMeterOver(page, '마이크', 1500), {
      message: 'fake mic beep moves the mic meter',
    })
    .toBeGreaterThan(0.01);
  await expect
    .poll(() => maxMeterOver(page, '화면 소리', 500), {
      message: 'screen audio moves the screen meter',
    })
    .toBeGreaterThan(0.01);
  await expect(page.getByText(SILENT_SCREEN)).toHaveCount(0);
  await shot(page, 'preflight-ok');
});

test('hints softly when the shared screen audio stays silent', async ({
  context,
}) => {
  const page = await openStudio(context, ['silent']);
  await pick(page, '화면 공유');
  await page.getByRole('button', { name: '방송 시작' }).click();

  await expect(page.getByText(SILENT_SCREEN)).toBeVisible({ timeout: 6000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('tells the streamer when the mic goes away and starts over on request', async ({
  context,
}) => {
  const page = await openStudio(context, ['tone', 'tone']);
  await pick(page, '화면 공유');

  await page.evaluate(() =>
    window.micTracks[0].dispatchEvent(new Event('ended')),
  );
  await expect(page.getByRole('alert')).toContainText(MIC_LOST);

  await page.getByRole('button', { name: '처음부터 다시' }).click();
  await expect
    .poll(() => page.evaluate(() => window.micTracks.length), {
      message: 'a fresh mic was requested',
    })
    .toBe(2);
  await expect(page.getByRole('button', { name: '방송 시작' })).toBeVisible();
  await page.bringToFront();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

const OTHER_BROWSERS = [
  {
    name: 'firefox',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:140.0) Gecko/20100101 Firefox/140.0',
  },
  {
    name: 'safari',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  },
];

for (const browser of OTHER_BROWSERS) {
  test.describe(browser.name, () => {
    test.use({ userAgent: browser.userAgent });

    test(`warns that ${browser.name} cannot share screen audio`, async ({
      context,
      page,
    }) => {
      await mockPublishApi(context);
      // The user agent override leaves Chrome's userAgentData in place;
      // Firefox and Safari do not have it.
      await page.addInitScript(() =>
        Object.defineProperty(Navigator.prototype, 'userAgentData', {
          get: () => undefined,
        }),
      );
      await page.goto(PUBLISH_PAGE);
      await expect(page.getByRole('alert')).toContainText(
        '이 브라우저는 화면 소리를 공유하지 못합니다',
      );
      await shot(page, `preflight-${browser.name}`);
    });
  });
}

test('shows no browser warning in Chrome', async ({ context, page }) => {
  await mockPublishApi(context);
  await page.goto(PUBLISH_PAGE);
  await expect(page.getByRole('button', { name: '화면 공유' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
