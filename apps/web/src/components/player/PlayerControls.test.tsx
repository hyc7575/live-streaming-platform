import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  HIDE_DELAY_MS,
  PlayerControls,
  SEEK_STEP_S,
  VOLUME_KEY,
} from './PlayerControls';

function Player({ muted = false }: { muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <PlayerControls videoRef={ref}>
      <video ref={ref} aria-label="화면" muted={muted} />
    </PlayerControls>
  );
}

function setPaused(video: HTMLVideoElement, paused: boolean) {
  Object.defineProperty(video, 'paused', { value: paused, configurable: true });
  fireEvent(video, new Event(paused ? 'pause' : 'play'));
}

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  pause = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const video = () => screen.getByLabelText<HTMLVideoElement>('화면');
const button = (name: string) => screen.getByRole('button', { name });

it('plays and pauses from the button and from the video itself', () => {
  render(<Player />);
  fireEvent.click(button('재생'));
  expect(play).toHaveBeenCalledTimes(1);

  act(() => setPaused(video(), false));
  fireEvent.click(button('일시정지'));
  expect(pause).toHaveBeenCalledTimes(1);

  fireEvent.click(video());
  expect(pause).toHaveBeenCalledTimes(2);
});

it('shows the big play button only once there is a picture to resume', () => {
  render(<Player />);
  expect(screen.getAllByRole('button', { name: '재생' })).toHaveLength(1);
  Object.defineProperty(video(), 'readyState', { value: 1 });
  fireEvent.loadedMetadata(video());
  expect(screen.getAllByRole('button', { name: '재생' })).toHaveLength(2);
});

it('offers 소리 켜기 when starting muted, and unmutes from it', () => {
  render(<Player muted />);
  fireEvent.click(button('소리 켜기'));
  expect(video().muted).toBe(false);
  expect(screen.queryByRole('button', { name: '소리 켜기' })).toBeNull();
});

it('offers 소리 켜기 when muted after start, such as by autoplay fallback', async () => {
  render(<Player />);
  expect(screen.queryByRole('button', { name: '소리 켜기' })).toBeNull();
  video().muted = true;
  expect(
    await screen.findByRole('button', { name: '소리 켜기' }),
  ).toBeDefined();
});

it('toggles mute from its button', async () => {
  render(<Player />);
  fireEvent.click(button('음소거'));
  expect(video().muted).toBe(true);
  fireEvent.click(await screen.findByRole('button', { name: '음소거 해제' }));
  expect(video().muted).toBe(false);
});

it('does not offer 소리 켜기 after the viewer muted on purpose', async () => {
  render(<Player />);
  fireEvent.click(button('음소거'));
  await screen.findByRole('button', { name: '음소거 해제' });
  expect(screen.queryByRole('button', { name: '소리 켜기' })).toBeNull();
});

it('remembers the volume but not the mute', async () => {
  render(<Player />);
  fireEvent.change(screen.getByRole('slider', { name: '볼륨' }), {
    target: { value: '0.4' },
  });
  fireEvent.click(button('음소거'));
  expect(video().volume).toBe(0.4);
  await waitFor(() => expect(localStorage.getItem(VOLUME_KEY)).toBe('0.4'));
  cleanup();

  render(<Player />);
  expect(video().volume).toBe(0.4);
  expect(video().muted).toBe(false);
});

it('ignores a stored volume it cannot use', () => {
  localStorage.setItem(VOLUME_KEY, 'loud');
  render(<Player />);
  expect(video().volume).toBe(1);
});

const slider = () =>
  screen.getByRole<HTMLInputElement>('slider', { name: '볼륨' });

it('shows the slider at zero while muted and back at the volume after', async () => {
  render(<Player />);
  fireEvent.change(slider(), { target: { value: '0.6' } });
  fireEvent.click(button('음소거'));
  await waitFor(() => expect(slider().value).toBe('0'));
  expect(video().volume).toBe(0.6);

  fireEvent.click(button('음소거 해제'));
  await waitFor(() => expect(slider().value).toBe('0.6'));
});

it('treats volume zero as muted, and unmuting it brings the sound back', async () => {
  render(<Player />);
  fireEvent.change(slider(), { target: { value: '0' } });
  fireEvent.click(await screen.findByRole('button', { name: '음소거 해제' }));
  expect(video().muted).toBe(false);
  expect(video().volume).toBe(1);
});

it('brings the sound back from M at volume zero, even when also muted', () => {
  render(<Player />);
  const player = video().parentElement!;
  fireEvent.change(slider(), { target: { value: '0' } });
  video().muted = true;
  fireEvent.keyDown(player, { key: 'm', code: 'KeyM' });
  expect(video().muted).toBe(false);
  expect(video().volume).toBe(1);
});

it('does not remember a volume of zero', async () => {
  render(<Player />);
  fireEvent.change(slider(), { target: { value: '0.4' } });
  await waitFor(() => expect(localStorage.getItem(VOLUME_KEY)).toBe('0.4'));
  fireEvent.change(slider(), { target: { value: '0' } });
  await waitFor(() => expect(video().volume).toBe(0));
  expect(localStorage.getItem(VOLUME_KEY)).toBe('0.4');
});

it('starts with sound when a volume of zero was stored', () => {
  localStorage.setItem(VOLUME_KEY, '0');
  render(<Player />);
  expect(video().volume).toBe(1);
});

it('unmutes on ArrowUp, the way the slider does', () => {
  render(<Player />);
  const player = video().parentElement!;
  fireEvent.keyDown(player, { key: 'm', code: 'KeyM' });
  fireEvent.keyDown(player, { key: 'ArrowDown', code: 'ArrowDown' });
  expect(video().muted).toBe(true);
  fireEvent.keyDown(player, { key: 'ArrowUp', code: 'ArrowUp' });
  expect(video().muted).toBe(false);
  expect(video().volume).toBe(1);
});

it('keeps the volume on a clean step', async () => {
  render(<Player />);
  const player = video().parentElement!;
  for (let i = 0; i < 3; i++) {
    fireEvent.keyDown(player, { key: 'ArrowDown', code: 'ArrowDown' });
  }
  expect(video().volume).toBe(0.7);
  await waitFor(() => expect(localStorage.getItem(VOLUME_KEY)).toBe('0.7'));
});

it('takes keys only while the player has focus', () => {
  render(
    <>
      <Player />
      <textarea aria-label="채팅" />
    </>,
  );
  const chat = screen.getByRole('textbox', { name: '채팅' });
  chat.focus();
  fireEvent.keyDown(chat, { key: ' ', code: 'Space' });
  fireEvent.keyDown(chat, { key: 'm', code: 'KeyM' });
  expect(play).not.toHaveBeenCalled();
  expect(video().muted).toBe(false);

  const player = video().parentElement!;
  player.focus();
  fireEvent.keyDown(player, { key: ' ', code: 'Space' });
  expect(play).toHaveBeenCalledTimes(1);
  // A Korean layout reports M as ㅡ; the physical key still mutes.
  fireEvent.keyDown(player, { key: 'ㅡ', code: 'KeyM' });
  expect(video().muted).toBe(true);
  fireEvent.keyDown(player, { key: 'ArrowDown', code: 'ArrowDown' });
  expect(video().volume).toBeCloseTo(0.9);
});

it('leaves Space on a control to the control itself', () => {
  render(<Player />);
  const playButton = button('재생');
  playButton.focus();
  fireEvent.keyDown(playButton, { key: ' ', code: 'Space' });
  expect(play).not.toHaveBeenCalled();
});

it('on touch, the first tap on hidden controls only brings them back', () => {
  vi.useFakeTimers();
  render(<Player />);
  act(() => setPaused(video(), false));
  act(() => {
    vi.advanceTimersByTime(HIDE_DELAY_MS);
  });
  const tap = () => {
    fireEvent.pointerDown(video(), { pointerType: 'touch' });
    fireEvent.click(video());
  };
  tap();
  expect(pause).not.toHaveBeenCalled();
  tap();
  expect(pause).toHaveBeenCalledTimes(1);
});

it('stays up while a control has focus, and hides once that control is gone', () => {
  vi.useFakeTimers();
  let edge = 20;
  function LivePlayerish() {
    const ref = useRef<HTMLVideoElement>(null);
    return (
      <PlayerControls
        videoRef={ref}
        live={{
          position: () => edge,
          seek: () => {
            edge = 0;
          },
        }}
      >
        <video ref={ref} aria-label="화면" />
      </PlayerControls>
    );
  }
  render(<LivePlayerish />);
  act(() => setPaused(video(), false));
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  const touchTapPauses = () => {
    const spy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const before = spy.mock.calls.length;
    fireEvent.pointerDown(video(), { pointerType: 'touch' });
    fireEvent.click(video());
    return spy.mock.calls.length > before;
  };

  const goLive = button('라이브로 이동');
  goLive.focus();
  act(() => {
    vi.advanceTimersByTime(HIDE_DELAY_MS * 2);
  });
  expect(touchTapPauses()).toBe(true);

  act(() => setPaused(video(), false));
  button('라이브로 이동').focus();
  fireEvent.click(button('라이브로 이동'));
  expect(screen.queryByRole('button', { name: '라이브로 이동' })).toBeNull();
  act(() => {
    vi.advanceTimersByTime(HIDE_DELAY_MS * 2);
  });
  expect(touchTapPauses()).toBe(false);
});

function setDuration(video: HTMLVideoElement, duration: number) {
  Object.defineProperty(video, 'duration', {
    value: duration,
    configurable: true,
  });
  fireEvent(video, new Event('durationchange'));
}

it('offers a seek bar and the time for a recording, not for live', () => {
  render(<Player />);
  expect(screen.queryByRole('slider', { name: '재생 위치' })).toBeNull();
  act(() => setDuration(video(), 3725));
  const seek = screen.getByRole<HTMLInputElement>('slider', {
    name: '재생 위치',
  });
  expect(screen.getByText('0:00 / 1:02:05')).toBeDefined();

  fireEvent.change(seek, { target: { value: '65' } });
  expect(video().currentTime).toBe(65);
  act(() => {
    fireEvent(video(), new Event('timeupdate'));
  });
  expect(screen.getByText('1:05 / 1:02:05')).toBeDefined();
  expect(seek.getAttribute('aria-valuetext')).toBe('1:05 / 1:02:05');
});

it('cycles the speed of a recording from one button', async () => {
  render(<Player />);
  expect(screen.queryByRole('button', { name: /재생 속도/ })).toBeNull();
  act(() => setDuration(video(), 60));

  let label = '재생 속도 1배';
  for (const rate of [1.25, 1.5, 2, 0.5, 1]) {
    fireEvent.click(button(label));
    label = `재생 속도 ${rate}배`;
    expect(
      (await screen.findByRole('button', { name: label })).textContent,
    ).toBe(`${rate}x`);
    expect(video().playbackRate).toBe(rate);
    expect(video().defaultPlaybackRate).toBe(rate);
  }
});

it('hides the seek bar while a live source has no end', () => {
  function Live() {
    const ref = useRef<HTMLVideoElement>(null);
    return (
      <PlayerControls videoRef={ref} live={{ position: () => 0, seek() {} }}>
        <video ref={ref} aria-label="화면" />
      </PlayerControls>
    );
  }
  render(<Live />);
  act(() => setDuration(video(), 100));
  expect(screen.queryByRole('slider', { name: '재생 위치' })).toBeNull();
  expect(screen.queryByRole('button', { name: /재생 속도/ })).toBeNull();
});

it('seeks a recording with the arrow keys, within its length', () => {
  render(<Player />);
  act(() => setDuration(video(), 7));
  const player = video().parentElement!;
  player.focus();
  fireEvent.keyDown(player, { key: 'ArrowRight', code: 'ArrowRight' });
  expect(video().currentTime).toBe(SEEK_STEP_S);
  fireEvent.keyDown(player, { key: 'ArrowRight', code: 'ArrowRight' });
  expect(video().currentTime).toBe(7);
  fireEvent.keyDown(player, { key: 'ArrowLeft', code: 'ArrowLeft' });
  fireEvent.keyDown(player, { key: 'ArrowLeft', code: 'ArrowLeft' });
  expect(video().currentTime).toBe(0);
});
