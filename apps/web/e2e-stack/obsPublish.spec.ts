import { expect, test, type Page } from '@playwright/test';
import {
  createBroadcast,
  screenshot,
  signUpAndLogIn,
  statusOf,
  watchUntilPlaying,
} from './support';

// 여기서는 OBS를 직접 돌릴 수 없어, 스트리머 쿠키가 없는 페이지의 최소 WHIP 클라이언트가
// 대신한다. OBS의 서버 칸처럼 복사한 URL 말고는 아무것도 없다.
// OBS가 보내는 대로 H.264만 쓴다.
async function whipPublish(client: Page, url: string): Promise<number> {
  return client.evaluate(async (whipUrl) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    const pc = new RTCPeerConnection();
    for (const track of stream.getTracks()) {
      const transceiver = pc.addTransceiver(track, { direction: 'sendonly' });
      if (track.kind === 'video') {
        transceiver.setCodecPreferences(
          (RTCRtpSender.getCapabilities('video')?.codecs ?? []).filter(
            (c) => c.mimeType === 'video/H264',
          ),
        );
      }
    }
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') resolve();
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') resolve();
      });
      setTimeout(resolve, 2000);
    });
    const res = await fetch(whipUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription?.sdp,
    });
    if (res.ok) {
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
      (window as unknown as { __pc: RTCPeerConnection }).__pc = pc;
    } else {
      pc.close();
    }
    return res.status;
  }, url);
}

const connectionOf = (client: Page) =>
  client.evaluate(
    () =>
      (window as unknown as { __pc?: RTCPeerConnection }).__pc
        ?.connectionState ?? 'none',
  );

test('a WHIP client with the OBS URL goes LIVE, blocks the browser start and is cut off by 방송 종료', async ({
  page,
  browser,
}) => {
  await signUpAndLogIn(page.request);
  const id = await createBroadcast(page.request, 'OBS 송출 확인');

  await page.goto(`/studio/broadcasts/${id}`);
  await page.getByRole('tab', { name: 'OBS로 송출' }).click();
  const obsPanel = page.getByRole('tabpanel', { name: 'OBS로 송출' });
  await obsPanel.getByRole('button', { name: 'URL 발급' }).click();
  const urlField = obsPanel.getByLabel('OBS 송출 주소');
  await expect(urlField).toHaveValue(
    new RegExp(`^http://localhost:\\d+/app/${id}\\?direction=whip&.*token=`),
  );
  const url = await urlField.inputValue();
  await expect(obsPanel.getByText(/까지 이 주소로 송출을/)).toBeVisible();
  await screenshot(page, 'obs-url-issued');

  const obsContext = await browser.newContext({
    permissions: ['camera', 'microphone'],
  });
  const obs = await obsContext.newPage();
  await obs.goto('/');
  expect(await whipPublish(obs, url)).toBe(201);
  await expect
    .poll(() => connectionOf(obs), { timeout: 15_000 })
    .toBe('connected');

  await expect(obsPanel.getByText('송출이 연결되어 있습니다.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(obsPanel.getByText('LIVE', { exact: true })).toBeVisible();
  await screenshot(page, 'obs-live');

  await page.getByRole('tab', { name: '브라우저로 송출' }).click();
  await page.getByRole('button', { name: '카메라 켜기' }).click();
  await expect(page.getByRole('button', { name: '방송 시작' })).toBeDisabled();
  await expect(page.getByText(/OBS나 다른 탭에서 송출 중입니다/)).toBeVisible();
  await screenshot(page, 'obs-live-browser-blocked');

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/broadcasts/${id}`);
  await watchUntilPlaying(viewer);
  await viewerContext.close();

  await page.getByRole('tab', { name: 'OBS로 송출' }).click();
  await obsPanel.getByRole('button', { name: '방송 종료' }).click();
  await obsPanel.getByRole('button', { name: '종료하기' }).click();
  await expect(page.getByText('방송을 종료했습니다.')).toBeVisible({
    timeout: 10_000,
  });
  expect(await statusOf(page.request, id)).toBe('ENDED');
  await expect
    .poll(() => connectionOf(obs), { timeout: 30_000 })
    .not.toBe('connected');

  const again = await whipPublish(obs, url);
  expect(again, 'reconnect after the end is refused').not.toBe(201);
  await obsContext.close();
});
