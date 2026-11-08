import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PcCapture, PcCaptureState } from '../capture/pcCapture';
import { startPcCapture } from '../capture/pcCapture';
import { PcStudioPage } from './PcStudioPage';

vi.mock('../capture/pcCapture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture/pcCapture')>()),
  startPcCapture: vi.fn(),
}));

afterEach(cleanup);

function fakeCapture() {
  let state: PcCaptureState = {
    status: 'live',
    hasScreenAudio: true,
    micMuted: false,
    audioRunning: false,
  };
  const listeners = new Set<() => void>();
  const setState = (next: PcCaptureState) => {
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
    resumeAudio: vi.fn(() => Promise.resolve()),
    setMicMuted: vi.fn((micMuted: boolean) => {
      if (state.status === 'live') setState({ ...state, micMuted });
    }),
    readLevels: () => ({ mic: 0, screen: 0 }),
    reselectScreen: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => setState({ status: 'ended', reason: 'stopped' })),
  } satisfies PcCapture;
  return { capture, setState };
}

async function renderCapturing() {
  const fake = fakeCapture();
  vi.mocked(startPcCapture).mockResolvedValue(fake.capture);
  render(<PcStudioPage />);
  fireEvent.click(screen.getByRole('button', { name: '화면 선택' }));
  await screen.findByRole('button', { name: '방송 시작' });
  return fake;
}

it('resumes the audio context synchronously inside the start click', async () => {
  const { capture } = await renderCapturing();
  fireEvent.click(screen.getByRole('button', { name: '방송 시작' }));
  expect(capture.resumeAudio).toHaveBeenCalledTimes(1);
});

it('keeps the preview video muted', async () => {
  await renderCapturing();
  const video = screen.getByLabelText<HTMLVideoElement>('미리보기');
  expect(video.muted).toBe(true);
});

it('toggles the mic mute through the capture', async () => {
  const { capture } = await renderCapturing();
  fireEvent.click(screen.getByRole('button', { name: '마이크 끄기' }));
  expect(capture.setMicMuted).toHaveBeenCalledWith(true);
  expect(
    screen
      .getByRole('button', { name: '마이크 켜기' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
});

it('tells the streamer when the browser stops the screen share', async () => {
  const { setState } = await renderCapturing();
  act(() => setState({ status: 'ended', reason: 'share-stopped' }));
  expect(screen.getByText('화면 공유가 끝났습니다.')).toBeDefined();
  expect(screen.getByRole('button', { name: '화면 선택' })).toBeDefined();
});

it('stops the capture when the streamer leaves the page', async () => {
  const { capture } = await renderCapturing();
  cleanup();
  expect(capture.stop).toHaveBeenCalled();
});
