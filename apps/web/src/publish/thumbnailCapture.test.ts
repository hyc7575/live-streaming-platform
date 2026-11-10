import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureFrame, useThumbnailCapture } from './thumbnailCapture';

// jsdom has no canvas. This one records what is drawn, so a test can see the
// frame's geometry and any transform applied before the draw.
interface CanvasRecord {
  draws: unknown[][];
  transforms: string[];
  blob: { type: string; quality: unknown } | null;
}

let canvas: CanvasRecord;

beforeEach(() => {
  canvas = { draws: [], transforms: [], blob: null };
  const transform = (name: string) => () => {
    canvas.transforms.push(name);
  };
  const context = {
    drawImage: (...args: unknown[]) => canvas.draws.push(args),
    scale: transform('scale'),
    translate: transform('translate'),
    rotate: transform('rotate'),
    transform: transform('transform'),
    setTransform: transform('setTransform'),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback, type, quality) => {
      canvas.blob = { type: type ?? '', quality };
      callback(new Blob(['jpeg'], { type }));
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function video(width: number, height: number): HTMLVideoElement {
  const element = document.createElement('video');
  Object.defineProperty(element, 'videoWidth', { value: width });
  Object.defineProperty(element, 'videoHeight', { value: height });
  return element;
}

it('draws the frame 480 px wide, keeping its aspect, as a 0.7 JPEG', async () => {
  const preview = video(1280, 720);

  const blob = await captureFrame(preview);

  expect(blob?.type).toBe('image/jpeg');
  expect(canvas.blob).toEqual({ type: 'image/jpeg', quality: 0.7 });
  expect(canvas.draws).toEqual([[preview, 0, 0, 480, 270]]);
});

it('draws a mirrored front-camera preview unmirrored', async () => {
  const preview = video(720, 960);
  preview.style.transform = 'scaleX(-1)';

  await captureFrame(preview);

  expect(canvas.transforms).toEqual([]);
  expect(canvas.draws).toEqual([[preview, 0, 0, 480, 640]]);
});

it('gives nothing before the video has a frame', async () => {
  expect(await captureFrame(video(0, 0))).toBeNull();
  expect(canvas.draws).toEqual([]);
});

function stubUploads(...results: ('ok' | 'fail')[]) {
  const fetchMock = vi.fn<
    (url: string, init: RequestInit) => Promise<Response>
  >(() => {
    const result = results.shift() ?? 'ok';
    return result === 'ok'
      ? Promise.resolve(new Response(null, { status: 204 }))
      : Promise.reject(new TypeError('network down'));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function capturing(enabled: boolean) {
  const ref = { current: video(1280, 720) };
  return renderHook(
    ({ on }: { on: boolean }) => useThumbnailCapture('b1', ref, on),
    { initialProps: { on: enabled } },
  );
}

it('uploads at once when enabled, then every 30 s until disabled', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const fetchMock = stubUploads();
  const hook = capturing(false);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchMock).not.toHaveBeenCalled();

  hook.rerender({ on: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/broadcasts/b1/thumbnail');
  expect(init.method).toBe('PUT');
  expect((init.body as FormData).get('image')).toBeInstanceOf(Blob);

  await vi.advanceTimersByTimeAsync(29_999);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);

  hook.rerender({ on: false });
  await vi.advanceTimersByTimeAsync(90_000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('stops when the page goes away', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const fetchMock = stubUploads();
  const hook = capturing(true);
  await vi.advanceTimersByTimeAsync(0);

  hook.unmount();
  await vi.advanceTimersByTimeAsync(90_000);

  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('shrugs off a failed upload and tries again on the next tick', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  const fetchMock = stubUploads('fail');
  capturing(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(30_000);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(await fetchMock.mock.results[1].value).toMatchObject({ status: 204 });
  process.off('unhandledRejection', unhandled);
  expect(unhandled).not.toHaveBeenCalled();
});
