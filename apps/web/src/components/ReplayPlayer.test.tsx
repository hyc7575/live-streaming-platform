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

it('plays a single recording with controls and no part buttons', () => {
  render(<ReplayPlayer files={['b1/1_0.mp4']} />);
  expect(video().getAttribute('src')).toBe('/recordings/b1/1_0.mp4');
  expect(video().controls).toBe(true);
  expect(video().hasAttribute('playsinline')).toBe(true);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText(/녹화가 나뉩니다/)).toBeNull();
  expect(play).not.toHaveBeenCalled();
});

it('moves on to the next part when one ends and keeps playing', () => {
  render(<ReplayPlayer files={['b1/1_0.mp4', 'b1/1_1.mp4']} />);
  expect(pressed()).toEqual(['1부']);
  expect(screen.getByText(/녹화가 나뉩니다/)).toBeDefined();

  fireEvent.ended(video());
  expect(video().getAttribute('src')).toBe('/recordings/b1/1_1.mp4');
  expect(pressed()).toEqual(['2부']);
  expect(play).toHaveBeenCalledTimes(1);

  fireEvent.ended(video());
  expect(video().getAttribute('src')).toBe('/recordings/b1/1_1.mp4');
  expect(play).toHaveBeenCalledTimes(1);
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
