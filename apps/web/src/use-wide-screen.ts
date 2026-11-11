import { useSyncExternalStore } from 'react';

// The same breakpoint as the `min-width: 1024px` media queries in the CSS:
// at it and above, the watch page puts the chat beside the player.
const WIDE = '(min-width: 1024px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

// Without matchMedia (jsdom) the screen counts as wide.
function isWide(): boolean {
  return (
    typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches
  );
}

export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, isWide);
}
