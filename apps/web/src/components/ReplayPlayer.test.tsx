import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { ReplayPlayer } from './ReplayPlayer';

let play: MockInstance<HTMLMediaElement['play']>;

beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const video = () => screen.getByLabelText<HTMLVideoElement>('다시보기 화면');
const pressed = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent);

it('plays a single recording under Lime controls and no part buttons', () => {
  render(<ReplayPlayer files={['b1/1_0.mp4']} />);
  expect(video().getAttribute('src')).toBe('/recordings/b1/1_0.mp4');
  expect(video().controls).toBe(false);
  expect(video().hasAttribute('playsinline')).toBe(true);
  expect(screen.getByRole('button', { name: '전체화면' })).toBeDefined();
  expect(screen.queryByRole('group', { name: '녹화 부분' })).toBeNull();
  expect(screen.queryByText(/녹화가 나뉩니다/)).toBeNull();
  expect(play).not.toHaveBeenCalled();
});

it('moves on to the next part when one ends and keeps playing', () => {
  render(<ReplayPlayer files={['b1/1_0.mp4', 'b1/1_1.mp4']} />);
  expect(pressed()).toEqual(['1부']);
  expect(screen.getByText(/녹화가 나뉩니다/)).toBeDefined();

  const first = video();
  first.volume = 0.3;
  fireEvent.ended(video());
  expect(video().getAttribute('src')).toBe('/recordings/b1/1_1.mp4');
  // Same element, so the viewer's volume and the controls stay attached.
  expect(video()).toBe(first);
  expect(video().volume).toBe(0.3);
  expect(pressed()).toEqual(['2부']);
  expect(play).toHaveBeenCalledTimes(1);

  fireEvent.ended(video());
  expect(video().getAttribute('src')).toBe('/recordings/b1/1_1.mp4');
  expect(play).toHaveBeenCalledTimes(1);
});

it('keeps the chosen speed into the next part', async () => {
  render(<ReplayPlayer files={['b1/1_0.mp4', 'b1/1_1.mp4']} />);
  Object.defineProperty(video(), 'duration', { value: 60 });
  fireEvent.durationChange(video());
  for (const label of ['1', '1.25', '1.5']) {
    fireEvent.click(
      await screen.findByRole('button', { name: `재생 속도 ${label}배` }),
    );
  }
  await screen.findByRole('button', { name: '재생 속도 2배' });

  fireEvent.ended(video());
  expect(video().getAttribute('src')).toBe('/recordings/b1/1_1.mp4');
  // jsdom skips the load a new src starts; a browser resets the rate here.
  video().playbackRate = video().defaultPlaybackRate;
  expect(video().playbackRate).toBe(2);
  expect(
    (await screen.findByRole('button', { name: '재생 속도 2배' })).textContent,
  ).toBe('2x');
});

it('jumps to the part the viewer picks', () => {
  render(<ReplayPlayer files={['b1/1_0.mp4', 'b1/1_1.mp4', 'b1/1_2.mp4']} />);
  fireEvent.click(screen.getByRole('button', { name: '3부' }));
  expect(video().getAttribute('src')).toBe('/recordings/b1/1_2.mp4');
  expect(pressed()).toEqual(['3부']);
  expect(play).toHaveBeenCalledTimes(1);
});

it('leaves the controls to the viewer when the browser blocks playback', async () => {
  play.mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
  render(<ReplayPlayer files={['b1/1_0.mp4', 'b1/1_1.mp4']} />);
  fireEvent.ended(video());
  await Promise.resolve();
  expect(video().getAttribute('src')).toBe('/recordings/b1/1_1.mp4');
});

it('reports the playhead once the viewer plays or seeks', () => {
  const onPlayhead = vi.fn();
  render(
    <ReplayPlayer
      files={['b1/1_0.mp4', 'b1/1_1.mp4']}
      onPlayhead={onPlayhead}
    />,
  );
  video().currentTime = 12;
  fireEvent.timeUpdate(video());
  expect(onPlayhead).not.toHaveBeenCalled();

  fireEvent.play(video());
  fireEvent.timeUpdate(video());
  expect(onPlayhead).toHaveBeenLastCalledWith({ part: 0, seconds: 12 });

  video().currentTime = 3;
  fireEvent.seeked(video());
  expect(onPlayhead).toHaveBeenLastCalledWith({ part: 0, seconds: 3 });

  fireEvent.click(screen.getByRole('button', { name: '2부' }));
  expect(onPlayhead).toHaveBeenLastCalledWith({ part: 1, seconds: 0 });
});

it('starts reporting on a seek before any playback', () => {
  const onPlayhead = vi.fn();
  render(<ReplayPlayer files={['b1/1_0.mp4']} onPlayhead={onPlayhead} />);
  video().currentTime = 40;
  fireEvent.seeked(video());
  expect(onPlayhead).toHaveBeenLastCalledWith({ part: 0, seconds: 40 });
});

it('reports the next part at 0 s when one ends', () => {
  const onPlayhead = vi.fn();
  render(
    <ReplayPlayer
      files={['b1/1_0.mp4', 'b1/1_1.mp4']}
      onPlayhead={onPlayhead}
    />,
  );
  fireEvent.ended(video());
  expect(onPlayhead).toHaveBeenLastCalledWith({ part: 1, seconds: 0 });
});
