import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  CameraCapture,
  CameraCaptureState,
} from '../capture/cameraCapture';
import {
  CameraCaptureError,
  startCameraCapture,
} from '../capture/cameraCapture';
import { MobileStudioPage } from './MobileStudioPage';

vi.mock('../capture/cameraCapture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture/cameraCapture')>()),
  startCameraCapture: vi.fn(),
}));

afterEach(cleanup);

function fakeCapture(canSwitchCamera = true) {
  let state: CameraCaptureState = {
    status: 'live',
    facing: 'user',
    canSwitchCamera,
    switching: false,
    wakeLock: 'active',
  };
  const listeners = new Set<() => void>();
  const setState = (next: CameraCaptureState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const capture = {
    stream: {} as MediaStream,
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    switchCamera: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => setState({ status: 'ended', reason: 'stopped' })),
  } satisfies CameraCapture;
  return { capture, setState };
}

async function renderCapturing(canSwitchCamera = true) {
  const fake = fakeCapture(canSwitchCamera);
  vi.mocked(startCameraCapture).mockResolvedValue(fake.capture);
  render(<MobileStudioPage />);
  fireEvent.click(screen.getByRole('button', { name: '카메라 켜기' }));
  await screen.findByRole('button', { name: '미리보기 끝내기' });
  return fake;
}

it('keeps the preview video muted and inline', async () => {
  await renderCapturing();
  const video = screen.getByLabelText<HTMLVideoElement>('미리보기');
  expect(video.muted).toBe(true);
  expect(video.playsInline).toBe(true);
});

it('hides the switch button on a single-camera device', async () => {
  await renderCapturing(false);
  expect(screen.queryByRole('button', { name: /카메라로 전환/ })).toBeNull();
});

it('says when the camera switch fails', async () => {
  const { capture } = await renderCapturing();
  capture.switchCamera.mockRejectedValueOnce(
    new CameraCaptureError('not-found'),
  );
  fireEvent.click(screen.getByRole('button', { name: '후면 카메라로 전환' }));
  expect(await screen.findByText('카메라를 바꾸지 못했습니다.')).toBeDefined();
});

it('tells the streamer when the camera is taken away', async () => {
  const { setState } = await renderCapturing();
  act(() => setState({ status: 'ended', reason: 'device-lost' }));
  expect(
    await screen.findByText('카메라나 마이크가 꺼졌습니다.'),
  ).toBeDefined();
  expect(screen.getByRole('button', { name: '카메라 켜기' })).toBeDefined();
});

it('shows the permission guide only for a denied permission', async () => {
  vi.mocked(startCameraCapture).mockRejectedValue(
    new CameraCaptureError('denied'),
  );
  render(<MobileStudioPage />);
  fireEvent.click(screen.getByRole('button', { name: '카메라 켜기' }));
  expect(
    await screen.findByRole('heading', {
      name: '카메라·마이크 권한이 꺼져 있습니다',
    }),
  ).toBeDefined();
});

it('asks for https when the page cannot reach the camera API', async () => {
  vi.mocked(startCameraCapture).mockRejectedValue(
    new CameraCaptureError('insecure'),
  );
  render(<MobileStudioPage />);
  fireEvent.click(screen.getByRole('button', { name: '카메라 켜기' }));
  expect((await screen.findByRole('alert')).textContent).toContain('https://');
});

it('stops the capture when the streamer leaves the page', async () => {
  const { capture } = await renderCapturing();
  cleanup();
  expect(capture.stop).toHaveBeenCalled();
});
