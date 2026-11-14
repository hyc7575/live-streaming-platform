import type { Locator, Page } from '@playwright/test';

// 가짜 카메라가 Date.now()를 흑백 칸으로 그리고, 다시보기 프레임은 캡처된 순간으로
// 디코드된다. 그래서 "이 위치가 맞는 순간을 보여 주는가"를
// 숫자로 바꾼다.
const BITS = 42;
const COLS = 14;
const ROWS = BITS / COLS;
// 비트마다 두 번 그리고 두 번째는 반전한다. 그래서 칸이 회색으로 번진 프레임은
// 틀린 시각으로 읽히지 않고 디코드에 실패한다.
const LAYOUT = { width: 640, height: 360, cell: 40, left: 40, top: 20 };

export async function installWallClockCamera(page: Page) {
  await page.addInitScript(
    ({ BITS, COLS, LAYOUT }) => {
      const media = navigator.mediaDevices;
      const original = media.getUserMedia.bind(media);
      media.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        if (!constraints?.video) return stream;
        const canvas = document.createElement('canvas');
        canvas.width = LAYOUT.width;
        canvas.height = LAYOUT.height;
        const ctx = canvas.getContext('2d')!;
        const paint = () => {
          const now = Date.now();
          ctx.fillStyle = '#808080';
          ctx.fillRect(0, 0, LAYOUT.width, LAYOUT.height);
          for (let i = 0; i < BITS; i += 1) {
            const bit = Math.floor(now / 2 ** i) % 2;
            const x = LAYOUT.left + (i % COLS) * LAYOUT.cell;
            const y = LAYOUT.top + Math.floor(i / COLS) * LAYOUT.cell;
            const rowsHeight = (BITS / COLS) * LAYOUT.cell;
            ctx.fillStyle = bit ? '#ffffff' : '#000000';
            ctx.fillRect(x, y, LAYOUT.cell, LAYOUT.cell);
            ctx.fillStyle = bit ? '#000000' : '#ffffff';
            ctx.fillRect(x, y + rowsHeight, LAYOUT.cell, LAYOUT.cell);
          }
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 32px monospace';
          ctx.fillText(new Date(now).toISOString().slice(11, 23), 40, 320);
        };
        paint();
        setInterval(paint, 33);
        const [track] = canvas.captureStream(30).getVideoTracks();
        for (const old of stream.getVideoTracks()) {
          stream.removeTrack(old);
          old.stop();
        }
        stream.addTrack(track);
        return stream;
      };
    },
    { BITS, COLS, LAYOUT },
  );
}

// video 요소가 지금 보여 주는 프레임의 캡처 시각. 칸이 디코드되지 않으면
// null.
export async function wallClockOf(video: Locator): Promise<number | null> {
  return video.evaluate(
    (v: HTMLVideoElement, { BITS, COLS, ROWS, LAYOUT }) => {
      const canvas = document.createElement('canvas');
      canvas.width = LAYOUT.width;
      canvas.height = LAYOUT.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, LAYOUT.width, LAYOUT.height);
      const lumaAt = (x: number, y: number) => {
        const inset = LAYOUT.cell / 4;
        const size = LAYOUT.cell / 2;
        const { data } = ctx.getImageData(x + inset, y + inset, size, size);
        let sum = 0;
        for (let p = 0; p < data.length; p += 4) sum += data[p + 1];
        return sum / (data.length / 4);
      };
      let ms = 0;
      for (let i = 0; i < BITS; i += 1) {
        const x = LAYOUT.left + (i % COLS) * LAYOUT.cell;
        const y = LAYOUT.top + Math.floor(i / COLS) * LAYOUT.cell;
        const plain = lumaAt(x, y) > 128;
        const inverted = lumaAt(x, y + ROWS * LAYOUT.cell) > 128;
        if (plain === inverted) return null;
        if (plain) ms += 2 ** i;
      }
      return ms;
    },
    { BITS, COLS, ROWS, LAYOUT },
  );
}

export async function seekTo(video: Locator, seconds: number) {
  await video.evaluate(
    (v: HTMLVideoElement, seconds) =>
      new Promise<void>((resolve) => {
        v.pause();
        v.addEventListener('seeked', () => resolve(), { once: true });
        v.currentTime = seconds;
      }),
    seconds,
  );
}
