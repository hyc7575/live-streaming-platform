import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFinePointer, useWideScreen } from './use-wide-screen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubMatchMedia(matches: boolean) {
  const add = vi.fn();
  const remove = vi.fn();
  const matchMedia = vi.fn(() => ({
    matches,
    addEventListener: add,
    removeEventListener: remove,
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  return { add, remove };
}

function Probe() {
  return <span>{String(useWideScreen())}</span>;
}

it('re-renders do not unsubscribe and resubscribe to the same query', () => {
  const { add, remove } = stubMatchMedia(true);
  const { rerender } = render(<Probe />);
  expect(add).toHaveBeenCalledTimes(1);
  rerender(<Probe />);
  rerender(<Probe />);
  expect(add).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
  cleanup();
  expect(remove).toHaveBeenCalledTimes(1);
});

it('returns the fallback when matchMedia is missing (jsdom)', () => {
  vi.stubGlobal('matchMedia', undefined);
  function Both() {
    return (
      <span>
        {String(useWideScreen())} {String(useFinePointer())}
      </span>
    );
  }
  render(<Both />);
  expect(screen.getByText('true false')).toBeTruthy();
});
