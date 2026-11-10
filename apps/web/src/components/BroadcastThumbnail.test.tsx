import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BroadcastThumbnail } from './BroadcastThumbnail';

afterEach(cleanup);

const LIVE = {
  title: '낚시 방송',
  status: 'LIVE' as const,
  startedAt: new Date().toISOString(),
};

function image(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector('img');
}

it('shows the captured frame, lazily and without alt text', () => {
  const { container } = render(
    <BroadcastThumbnail
      broadcast={{ ...LIVE, thumbnailUrl: '/thumbnails/b1/live.jpg?v=1' }}
    />,
  );
  const img = image(container);
  expect(img?.getAttribute('src')).toBe('/thumbnails/b1/live.jpg?v=1');
  expect(img?.getAttribute('alt')).toBe('');
  expect(img?.getAttribute('loading')).toBe('lazy');
  expect(screen.queryByText('낚')).toBeNull();
  expect(screen.getByText('LIVE')).toBeDefined();
});

it('draws the first letter when there is no thumbnail', () => {
  const { container } = render(
    <BroadcastThumbnail broadcast={{ ...LIVE, thumbnailUrl: null }} />,
  );
  expect(image(container)).toBeNull();
  expect(screen.getByText('낚')).toBeDefined();
});

it('falls back to the letter when the image fails, until the URL changes', () => {
  const { container, rerender } = render(
    <BroadcastThumbnail
      broadcast={{ ...LIVE, thumbnailUrl: '/thumbnails/b1/live.jpg?v=1' }}
    />,
  );
  fireEvent.error(image(container)!);
  expect(image(container)).toBeNull();
  expect(screen.getByText('낚')).toBeDefined();

  rerender(
    <BroadcastThumbnail
      broadcast={{ ...LIVE, thumbnailUrl: '/thumbnails/b1/live.jpg?v=2' }}
    />,
  );
  expect(image(container)?.getAttribute('src')).toBe(
    '/thumbnails/b1/live.jpg?v=2',
  );
});
