import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlayerControls } from './PlayerControls';
import { useMediaState } from './useMediaState';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setTime(video: HTMLVideoElement, time: number) {
  Object.defineProperty(video, 'currentTime', {
    value: time,
    configurable: true,
  });
  fireEvent(video, new Event('timeupdate'));
}

function Probe({
  trackTime,
  onRender,
}: {
  trackTime: boolean;
  onRender: (currentTime: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const media = useMediaState(ref, trackTime);
  onRender(media.currentTime);
  return <video ref={ref} aria-label="화면" />;
}

it('re-renders on every timeupdate when tracking time (recording)', () => {
  const onRender = vi.fn();
  render(<Probe trackTime onRender={onRender} />);
  const video = screen.getByLabelText<HTMLVideoElement>('화면');
  const before = onRender.mock.calls.length;
  act(() => setTime(video, 1));
  act(() => setTime(video, 2));
  expect(onRender.mock.calls.length).toBe(before + 2);
  expect(onRender).toHaveBeenLastCalledWith(2);
});

it('does not re-render on timeupdate when not tracking time (live)', () => {
  const onRender = vi.fn();
  render(<Probe trackTime={false} onRender={onRender} />);
  const video = screen.getByLabelText<HTMLVideoElement>('화면');
  const before = onRender.mock.calls.length;
  act(() => setTime(video, 1));
  act(() => setTime(video, 2));
  expect(onRender.mock.calls.length).toBe(before);
});

it('still re-renders a live player on pause', () => {
  const onRender = vi.fn();
  render(<Probe trackTime={false} onRender={onRender} />);
  const video = screen.getByLabelText<HTMLVideoElement>('화면');
  const before = onRender.mock.calls.length;
  Object.defineProperty(video, 'paused', { value: false, configurable: true });
  act(() => {
    fireEvent(video, new Event('play'));
  });
  expect(onRender.mock.calls.length).toBe(before + 1);
});

it('PlayerControls keeps recording time and live edge UI', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  function Rec() {
    const ref = useRef<HTMLVideoElement>(null);
    return (
      <PlayerControls videoRef={ref}>
        <video ref={ref} aria-label="화면" />
      </PlayerControls>
    );
  }
  render(<Rec />);
  const video = screen.getByLabelText<HTMLVideoElement>('화면');
  Object.defineProperty(video, 'duration', { value: 120, configurable: true });
  act(() => {
    fireEvent(video, new Event('durationchange'));
  });
  act(() => setTime(video, 65));
  expect(screen.getByText('1:05 / 2:00')).toBeTruthy();
});

it('PlayerControls live keeps the edge indicator and 라이브로 이동 button', () => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const seek = vi.fn();
  let position = 100;
  function Live() {
    const ref = useRef<HTMLVideoElement>(null);
    return (
      <PlayerControls videoRef={ref} live={{ position: () => position, seek }}>
        <video ref={ref} aria-label="화면" />
      </PlayerControls>
    );
  }
  render(<Live />);
  const video = screen.getByLabelText<HTMLVideoElement>('화면');
  act(() => setTime(video, 99));
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(screen.getByText('LIVE')).toBeTruthy();
  position = 200;
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(screen.queryByText('LIVE')).toBeNull();
  fireEvent.click(screen.getByText('라이브로 이동'));
  expect(seek).toHaveBeenCalledTimes(1);
});
