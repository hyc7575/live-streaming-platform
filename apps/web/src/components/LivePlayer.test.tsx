import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RETRY_DELAY_MS } from '../playback';
import { LivePlayer } from './LivePlayer';

type ErrorListener = (event: string, data: { fatal: boolean }) => void;

const hls = vi.hoisted(() => {
  const instances: {
    config: unknown;
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    fail: (fatal: boolean) => void;
    liveSyncPosition: number | null;
  }[] = [];
  const supported = { value: true };
  return { instances, supported };
});

vi.mock('hls.js', () => {
  class FakeHls {
    static Events = { ERROR: 'hlsError' };
    static isSupported = () => hls.supported.value;
    private onError: ErrorListener | null = null;
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    liveSyncPosition: number | null = null;
    constructor(readonly config: unknown) {
      hls.instances.push(this);
    }
    on(_event: string, listener: ErrorListener) {
      this.onError = listener;
    }
    fail(fatal: boolean) {
      this.onError?.('hlsError', { fatal });
    }
  }
  return { default: FakeHls };
});

beforeEach(() => {
  hls.instances.length = 0;
  hls.supported.value = true;
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  // jsdom's play() returns nothing; a browser's returns a promise.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function canPlayNativeHls(answer: CanPlayTypeResult) {
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(answer);
}

const loading = () => screen.queryByText('방송을 불러오는 중입니다');

it('plays through low-latency hls.js where MediaSource exists, even if HLS is native too', () => {
  vi.stubGlobal('MediaSource', class {});
  canPlayNativeHls('maybe');
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  expect(hls.instances).toHaveLength(1);
  const [player] = hls.instances;
  expect(player?.config).toMatchObject({ lowLatencyMode: true });
  expect(player?.loadSource).toHaveBeenCalledWith('/app/b1/llhls.m3u8');
  expect(player?.attachMedia).toHaveBeenCalledWith(
    screen.getByLabelText('방송 화면'),
  );
  expect(loading()).not.toBeNull();
});

it('retries after a fatal error, such as the playlist 404 before OME is ready', () => {
  vi.stubGlobal('MediaSource', class {});
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  const first = hls.instances[0];
  act(() => first?.fail(false));
  expect(first?.destroy).not.toHaveBeenCalled();

  act(() => first?.fail(true));
  expect(first?.destroy).toHaveBeenCalled();
  expect(hls.instances).toHaveLength(1);
  act(() => {
    vi.advanceTimersByTime(RETRY_DELAY_MS);
  });
  expect(hls.instances).toHaveLength(2);
  expect(hls.instances[1]?.loadSource).toHaveBeenCalledWith(
    '/app/b1/llhls.m3u8',
  );
  expect(loading()).not.toBeNull();
});

it('hides the loading notice once the video plays', () => {
  vi.stubGlobal('MediaSource', class {});
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  fireEvent.playing(screen.getByLabelText('방송 화면'));
  expect(loading()).toBeNull();
});

it('tears hls.js down and drops a pending retry on unmount', () => {
  vi.stubGlobal('MediaSource', class {});
  const { unmount } = render(
    <LivePlayer broadcastId="b1" startMuted={false} />,
  );
  act(() => hls.instances[0]?.fail(true));
  unmount();
  act(() => {
    vi.advanceTimersByTime(RETRY_DELAY_MS * 2);
  });
  expect(hls.instances).toHaveLength(1);

  render(<LivePlayer broadcastId="b2" startMuted={false} />);
  const live = hls.instances[1];
  cleanup();
  expect(live?.destroy).toHaveBeenCalled();
});

it('uses native HLS where there is no MediaSource (iPhone Safari)', () => {
  canPlayNativeHls('maybe');
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  const video = screen.getByLabelText<HTMLVideoElement>('방송 화면');
  expect(hls.instances).toHaveLength(0);
  expect(video.getAttribute('src')).toBe('/app/b1/llhls.m3u8');

  video.removeAttribute('src');
  fireEvent.error(video);
  act(() => {
    vi.advanceTimersByTime(RETRY_DELAY_MS);
  });
  expect(video.getAttribute('src')).toBe('/app/b1/llhls.m3u8');
});

it('says so when the browser can play neither', () => {
  hls.supported.value = false;
  canPlayNativeHls('');
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  expect(
    screen.getByText('이 브라우저에서는 방송을 재생할 수 없습니다.'),
  ).toBeDefined();
});

it('reports a fatal hls.js error, not a recoverable one, and still retries', () => {
  vi.stubGlobal('MediaSource', class {});
  const onPlaybackError = vi.fn();
  render(
    <LivePlayer
      broadcastId="b1"
      startMuted={false}
      onPlaybackError={onPlaybackError}
    />,
  );
  act(() => hls.instances[0]?.fail(false));
  expect(onPlaybackError).not.toHaveBeenCalled();

  act(() => hls.instances[0]?.fail(true));
  expect(onPlaybackError).toHaveBeenCalledTimes(1);
  act(() => {
    vi.advanceTimersByTime(RETRY_DELAY_MS);
  });
  expect(hls.instances).toHaveLength(2);
});

it('reports native HLS error and stalled events', () => {
  canPlayNativeHls('maybe');
  const onPlaybackError = vi.fn();
  render(
    <LivePlayer
      broadcastId="b1"
      startMuted={false}
      onPlaybackError={onPlaybackError}
    />,
  );
  const video = screen.getByLabelText<HTMLVideoElement>('방송 화면');
  fireEvent.error(video);
  expect(onPlaybackError).toHaveBeenCalledTimes(1);
  fireEvent.stalled(video);
  expect(onPlaybackError).toHaveBeenCalledTimes(2);
});

it('starts muted when asked to, and with sound otherwise', () => {
  vi.stubGlobal('MediaSource', class {});
  render(<LivePlayer broadcastId="b1" startMuted />);
  expect(screen.getByLabelText<HTMLVideoElement>('방송 화면').muted).toBe(true);
  cleanup();

  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  expect(screen.getByLabelText<HTMLVideoElement>('방송 화면').muted).toBe(
    false,
  );
});

it('plays muted when the browser refuses to start with sound', async () => {
  vi.stubGlobal('MediaSource', class {});
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new DOMException('no gesture', 'NotAllowedError'))
    .mockResolvedValue();
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  const video = screen.getByLabelText<HTMLVideoElement>('방송 화면');
  fireEvent.loadedMetadata(video);
  await act(() => Promise.resolve());
  expect(play).toHaveBeenCalledTimes(2);
  expect(video.muted).toBe(true);
});

it('asks native HLS to play right away, falling back to muted', async () => {
  canPlayNativeHls('maybe');
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new DOMException('no gesture', 'NotAllowedError'))
    .mockResolvedValue();
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  await act(() => Promise.resolve());
  expect(play).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText<HTMLVideoElement>('방송 화면').muted).toBe(true);
});

it('shows the loading notice again while a retry is pending after playing', () => {
  vi.stubGlobal('MediaSource', class {});
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  fireEvent.playing(screen.getByLabelText('방송 화면'));
  act(() => hls.instances[0]?.fail(true));
  expect(loading()).not.toBeNull();
});

it('does not retry play when an already muted video is refused', async () => {
  vi.stubGlobal('MediaSource', class {});
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValue(new DOMException('no gesture', 'NotAllowedError'));
  render(<LivePlayer broadcastId="b1" startMuted />);
  fireEvent.loadedMetadata(screen.getByLabelText('방송 화면'));
  await act(() => Promise.resolve());
  expect(play).toHaveBeenCalledTimes(1);
});

it('keeps sound when the browser lets it start with sound', async () => {
  vi.stubGlobal('MediaSource', class {});
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  const video = screen.getByLabelText<HTMLVideoElement>('방송 화면');
  fireEvent.loadedMetadata(video);
  await act(() => Promise.resolve());
  expect(video.muted).toBe(false);
});

it('drops the native source and a pending retry on unmount', () => {
  canPlayNativeHls('maybe');
  const { unmount } = render(
    <LivePlayer broadcastId="b1" startMuted={false} />,
  );
  const video = screen.getByLabelText<HTMLVideoElement>('방송 화면');
  fireEvent.error(video);
  unmount();
  act(() => {
    vi.advanceTimersByTime(RETRY_DELAY_MS * 2);
  });
  expect(video.getAttribute('src')).toBeNull();
});

it('draws its own controls instead of the browser ones', () => {
  vi.stubGlobal('MediaSource', class {});
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  expect(screen.getByLabelText('방송 화면').hasAttribute('controls')).toBe(
    false,
  );
  expect(screen.getByRole('button', { name: '재생' })).toBeDefined();
  expect(screen.getByRole('button', { name: '전체화면' })).toBeDefined();
});

it('offers 소리 켜기 to the owner, who starts muted', () => {
  vi.stubGlobal('MediaSource', class {});
  render(<LivePlayer broadcastId="b1" startMuted />);
  expect(screen.getByRole('button', { name: '소리 켜기' })).toBeDefined();
});

it('offers 소리 켜기 after the browser forced a muted start', async () => {
  vi.stubGlobal('MediaSource', class {});
  vi.spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new DOMException('no gesture', 'NotAllowedError'))
    .mockResolvedValue();
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  expect(screen.queryByRole('button', { name: '소리 켜기' })).toBeNull();
  fireEvent.loadedMetadata(screen.getByLabelText('방송 화면'));
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
  expect(screen.getByRole('button', { name: '소리 켜기' })).toBeDefined();
});

it('shows LIVE near the live edge and catches up once behind', () => {
  vi.stubGlobal('MediaSource', class {});
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  const video = screen.getByLabelText<HTMLVideoElement>('방송 화면');
  const instance = hls.instances[0];
  const toLive = () => screen.queryByRole('button', { name: '라이브로 이동' });

  instance.liveSyncPosition = 20;
  video.currentTime = 17;
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(screen.getByText('LIVE')).toBeDefined();
  expect(toLive()).toBeNull();

  video.currentTime = 16;
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(screen.queryByText('LIVE')).toBeNull();
  play.mockClear();
  fireEvent.click(toLive()!);
  expect(video.currentTime).toBe(20);
  expect(play).toHaveBeenCalled();
  expect(screen.getByText('LIVE')).toBeDefined();
});

it('reads the live edge from the hls.js instance that replaced a failed one', () => {
  vi.stubGlobal('MediaSource', class {});
  render(<LivePlayer broadcastId="b1" startMuted={false} />);
  act(() => hls.instances[0]?.fail(true));
  act(() => {
    vi.advanceTimersByTime(RETRY_DELAY_MS);
  });
  hls.instances[1].liveSyncPosition = 30;
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  fireEvent.click(screen.getByRole('button', { name: '라이브로 이동' }));
  expect(screen.getByLabelText<HTMLVideoElement>('방송 화면').currentTime).toBe(
    30,
  );
});
