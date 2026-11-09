import { expect, test, type Page } from '@playwright/test';
import { TONE_TAB_TITLE } from '../playwright.config';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  statusOf,
  watchUntilPlaying,
} from './support';

// Like the CI capture tests: no fake UI flag, so getDisplayMedia captures
// the real tab picked by title.
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      `--auto-select-tab-capture-source-by-title=${TONE_TAB_TITLE}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
  permissions: ['camera', 'microphone'],
});

const TONE_PAGE = `<!doctype html><title>${TONE_TAB_TITLE}</title>
<p>440Hz</p>
<script>
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.connect(ctx.destination);
  osc.start();
</script>`;

interface Probe {
  peerConnections: RTCPeerConnection[];
  displayStreams: MediaStream[];
  sentBefore: MediaStreamTrack | null;
  viewerAnalyser: AnalyserNode;
}

function recordPublish() {
  const probe = window as unknown as Probe;
  probe.peerConnections = [];
  probe.displayStreams = [];
  const Original = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends Original {
    constructor(config?: RTCConfiguration) {
      super(config);
      probe.peerConnections.push(this);
    }
  };
  const devices = navigator.mediaDevices;
  const getDisplayMedia = devices.getDisplayMedia.bind(devices);
  devices.getDisplayMedia = async (options) => {
    const stream = await getDisplayMedia(options);
    probe.displayStreams.push(stream);
    return stream;
  };
}

function sentVideo(page: Page) {
  return page.evaluate(() => {
    const probe = window as unknown as Probe;
    const sender = probe.peerConnections
      .at(-1)
      ?.getSenders()
      .find((s) => s.track?.kind === 'video');
    return sender?.track
      ? { id: sender.track.id, readyState: sender.track.readyState }
      : null;
  });
}

function currentTime(viewer: Page) {
  return viewer
    .getByLabel('방송 화면')
    .evaluate((v: HTMLVideoElement) => v.currentTime);
}

// The fake mic beeps about once a second. Headless Chrome captures tab audio
// as silence, so the beeps are what a viewer can hear here.
async function maxViewerLevel(viewer: Page) {
  return viewer.evaluate(async () => {
    const analyser = (window as unknown as Probe).viewerAnalyser;
    const buffer = new Float32Array(analyser.fftSize);
    let max = 0;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 50));
      analyser.getFloatTimeDomainData(buffer);
      for (const sample of buffer) max = Math.max(max, Math.abs(sample));
    }
    return max;
  });
}

test('a shared screen with mic reaches a viewer, survives a reselect, and ends when sharing stops', async ({
  context,
  page,
  browser,
}) => {
  await context.route('**/e2e-tone', (route) =>
    route.fulfill({ contentType: 'text/html', body: TONE_PAGE }),
  );
  const tone = await context.newPage();
  await tone.goto('/e2e-tone');

  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, 'PC 화면 송출');
  await page.addInitScript(recordPublish);
  await page.goto(`/studio/broadcasts/${id}`);

  await test.step('share the screen and go live', async () => {
    await page.getByRole('button', { name: '화면 공유' }).click();
    // Chrome focuses the captured tab; a streamer comes back first.
    await expect(page.getByRole('button', { name: '방송 시작' })).toBeVisible();
    await page.bringToFront();
    await page.getByRole('button', { name: '방송 시작' }).click();
    await expect(page.getByText('송출 중입니다.')).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() => statusOf(page.request, id), { timeout: 10_000 })
      .toBe('LIVE');
    await screenshot(page, 'publish-screen-live');
  });

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();

  await test.step('an anonymous viewer sees and hears it', async () => {
    await viewer.goto(`/broadcasts/${id}`);
    await watchUntilPlaying(viewer);
    const video = viewer.getByLabel('방송 화면');
    expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
    await expect(viewer.getByText(/하울링/)).toHaveCount(0);

    const decoded = () =>
      video.evaluate(
        (v: HTMLVideoElement & { webkitAudioDecodedByteCount: number }) =>
          v.webkitAudioDecodedByteCount,
      );
    const first = await decoded();
    await expect
      .poll(decoded, { message: 'the viewer keeps decoding audio' })
      .toBeGreaterThan(first);

    await video.evaluate((v: HTMLVideoElement) => {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaElementSource(v).connect(analyser);
      analyser.connect(ctx.destination);
      (window as unknown as Probe).viewerAnalyser = analyser;
    });
    await expect
      .poll(() => maxViewerLevel(viewer), {
        message: 'the fake mic beeps reach the viewer',
        timeout: 20_000,
      })
      .toBeGreaterThan(0.01);
    await screenshot(viewer, 'viewer-screen-playing');
  });

  await test.step('reselecting sends the new screen and releases the old one', async () => {
    const before = await sentVideo(page);
    expect(before?.readyState).toBe('live');
    await page.evaluate(() => {
      const probe = window as unknown as Probe;
      probe.sentBefore =
        probe.peerConnections
          .at(-1)
          ?.getSenders()
          .find((s) => s.track?.kind === 'video')?.track ?? null;
    });

    await page.getByRole('button', { name: '다시 선택' }).click();
    await expect
      .poll(async () => (await sentVideo(page))?.id)
      .not.toBe(before?.id);
    await page.bringToFront();
    expect((await sentVideo(page))?.readyState).toBe('live');
    const released = await page.evaluate(() => {
      const probe = window as unknown as Probe;
      return {
        previousSent: probe.sentBefore?.readyState,
        displays: probe.displayStreams.length,
        firstScreen: probe.displayStreams[0]
          .getTracks()
          .map((t) => t.readyState),
      };
    });
    expect(released.previousSent, 'the replaced clone is stopped').toBe(
      'ended',
    );
    expect(released.displays).toBe(2);
    expect(released.firstScreen, 'the first screen is released').not.toContain(
      'live',
    );

    const at = await currentTime(viewer);
    await expect
      .poll(() => currentTime(viewer), {
        message: 'the viewer keeps playing across the switch',
        timeout: 20_000,
      })
      .toBeGreaterThan(at + 2);
  });

  await test.step('stopping the share ends the broadcast', async () => {
    await tone.close();
    const stoppedAt = Date.now();
    await expect(page.getByText('방송을 종료했습니다.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText('화면 공유를 중지해 방송을 종료했습니다.'),
    ).toBeVisible();
    expect(await statusOf(page.request, id)).toBe('ENDED');
    await expect(viewer.getByText('방송이 끝났습니다.')).toBeVisible({
      timeout: 10_000,
    });
    expect(Date.now() - stoppedAt).toBeLessThan(10_000);
    await screenshot(page, 'publish-screen-share-stopped');
  });

  await viewerContext.close();
});
