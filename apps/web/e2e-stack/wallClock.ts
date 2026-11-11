import type { Locator, Page } from '@playwright/test';

// The fake camera paints Date.now() as black and white cells, and a replay
// frame decodes back to the moment it was captured. That turns "does this
// position show the right moment" into a number.
const BITS = 42;
const COLS = 14;
const ROWS = BITS / COLS;
// Each bit is painted twice, the second time inverted, so a frame whose
// cells blur into grey fails to decode instead of reading a wrong time.
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

// The capture time of the frame the video element shows now, or null when
// the cells do not decode.
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
