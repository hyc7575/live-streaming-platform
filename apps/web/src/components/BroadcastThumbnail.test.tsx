import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BroadcastThumbnail } from './BroadcastThumbnail';

afterEach(cleanup);

const FRAME = '/thumbnails/b1/live.jpg?v=1';
const STANDBY = '/thumbnails/users/u1/standby.png?v=1';

const LIVE = {
  title: '낚시 방송',
  status: 'LIVE' as const,
  startedAt: new Date().toISOString(),
  thumbnailUrl: null,
  standbyImageUrl: null,
};

function image(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector('img');
}

it('shows the captured frame, lazily and without alt text', () => {
  const { container } = render(
    <BroadcastThumbnail broadcast={{ ...LIVE, thumbnailUrl: FRAME }} />,
  );
  const img = image(container);
  expect(img?.getAttribute('src')).toBe(FRAME);
  expect(img?.getAttribute('alt')).toBe('');
  expect(img?.getAttribute('loading')).toBe('lazy');
  expect(screen.queryByText('낚')).toBeNull();
  expect(screen.getByText('LIVE')).toBeDefined();
});

it('draws the first letter when there is no image at all', () => {
  const { container } = render(<BroadcastThumbnail broadcast={LIVE} />);
  expect(image(container)).toBeNull();
  expect(screen.getByText('낚')).toBeDefined();
});

it.each([
  ['READY', FRAME, STANDBY, STANDBY],
  ['READY', FRAME, null, null],
  ['LIVE', FRAME, STANDBY, FRAME],
  ['LIVE', null, STANDBY, STANDBY],
  ['ENDED', FRAME, STANDBY, FRAME],
  ['ENDED', null, STANDBY, STANDBY],
] as const)(
  'a %s card with frame %s and standby %s shows %s',
  (status, thumbnailUrl, standbyImageUrl, shown) => {
    const { container } = render(
      <BroadcastThumbnail
        broadcast={{ ...LIVE, status, thumbnailUrl, standbyImageUrl }}
      />,
    );
    expect(image(container)?.getAttribute('src') ?? null).toBe(shown);
  },
);

it('falls from the frame to the standby image to the letter as each fails', () => {
  const { container } = render(
    <BroadcastThumbnail
      broadcast={{ ...LIVE, thumbnailUrl: FRAME, standbyImageUrl: STANDBY }}
    />,
  );
  fireEvent.error(image(container)!);
  expect(image(container)?.getAttribute('src')).toBe(STANDBY);
  fireEvent.error(image(container)!);
  expect(image(container)).toBeNull();
  expect(screen.getByText('낚')).toBeDefined();
});

it('tries a failed image again once its URL changes', () => {
  const { container, rerender } = render(
    <BroadcastThumbnail broadcast={{ ...LIVE, thumbnailUrl: FRAME }} />,
  );
  fireEvent.error(image(container)!);
  expect(image(container)).toBeNull();

  rerender(
    <BroadcastThumbnail
      broadcast={{ ...LIVE, thumbnailUrl: '/thumbnails/b1/live.jpg?v=2' }}
    />,
  );
  expect(image(container)?.getAttribute('src')).toBe(
    '/thumbnails/b1/live.jpg?v=2',
  );
});
