import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  AudioLevels,
  PcCapture,
  PcCaptureState,
} from '../capture/pcCapture';
import { startPcCapture } from '../capture/pcCapture';
import { currentScreenAudioSupport } from '../capture/screenAudioSupport';
import { PcStudioPage } from './PcStudioPage';

vi.mock('../capture/pcCapture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture/pcCapture')>()),
  startPcCapture: vi.fn(),
}));

vi.mock('../capture/screenAudioSupport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture/screenAudioSupport')>()),
  currentScreenAudioSupport: vi.fn(() => 'supported'),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function fakeCapture() {
  let state: PcCaptureState = {
    status: 'live',
    hasScreenAudio: true,
    micMuted: false,
    micLost: false,
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
    readLevels: vi.fn<() => AudioLevels>(() => ({ mic: 0, screen: 0 })),
    reselectScreen: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => setState({ status: 'ended', reason: 'stopped' })),
  } satisfies PcCapture;
  const patchLive = (
    patch: Partial<Extract<PcCaptureState, { status: 'live' }>>,
  ) => {
    if (state.status === 'live') setState({ ...state, ...patch });
  };
  return { capture, setState, patchLive };
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

it('warns about missing screen audio next to the reselect button', async () => {
  const { capture, patchLive } = await renderCapturing();
  expect(screen.queryByRole('alert')).toBeNull();
  act(() => patchLive({ hasScreenAudio: false }));
  expect(screen.getByRole('alert').textContent).toContain(
    '탭 오디오와 함께 공유',
  );
  fireEvent.click(screen.getByRole('button', { name: '다시 선택' }));
  expect(capture.reselectScreen).toHaveBeenCalledTimes(1);
});

it('hints softly when the shared screen audio stays silent', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'performance'] });
  const { capture, patchLive } = await renderCapturing();
  act(() => patchLive({ audioRunning: true }));
  act(() => {
    vi.advanceTimersByTime(3400);
  });
  expect(screen.getByText(/화면 소리가 아직 들리지 않습니다/)).toBeDefined();
  expect(screen.queryByRole('alert')).toBeNull();

  capture.readLevels.mockReturnValue({ mic: 0, screen: 0.2 });
  act(() => {
    vi.advanceTimersByTime(400);
  });
  expect(screen.queryByText(/화면 소리가 아직 들리지 않습니다/)).toBeNull();
});

it('tells the streamer when the mic is unplugged and restarts on request', async () => {
  const { capture, patchLive } = await renderCapturing();
  act(() => patchLive({ micLost: true }));
  expect(screen.getByRole('alert').textContent).toContain(
    '마이크 연결이 끊겼습니다',
  );
  fireEvent.click(screen.getByRole('button', { name: '처음부터 다시' }));
  expect(capture.stop).toHaveBeenCalled();
  expect(startPcCapture).toHaveBeenCalledTimes(2);
});

it.each([
  ['no-screen-audio', '이 브라우저는 화면 소리를 공유하지 못합니다'],
  ['no-screen-capture', '이 브라우저는 화면 공유를 지원하지 않습니다'],
] as const)('warns before capture on a %s browser', (support, text) => {
  vi.mocked(currentScreenAudioSupport).mockReturnValueOnce(support);
  render(<PcStudioPage />);
  expect(screen.getByRole('alert').textContent).toContain(text);
});

it('shows no browser warning on Chrome or Edge', () => {
  render(<PcStudioPage />);
  expect(screen.queryByRole('alert')).toBeNull();
});
