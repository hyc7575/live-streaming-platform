import { useLayoutEffect, useRef } from 'react';

// Within this many pixels of the end, the list counts as at the bottom.
const STICK_THRESHOLD_PX = 40;

// Keeps a list scrolled to its newest (last) item whenever `items` changes,
// unless the viewer scrolled up to read. `stick()` re-arms it, for the
// viewer's own post.
export function useStickToBottom<T extends HTMLElement>(items: unknown) {
  const listRef = useRef<T>(null);
  const stickRef = useRef(true);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickRef.current) list.scrollTop = list.scrollHeight;
  }, [items]);

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    stickRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight <
      STICK_THRESHOLD_PX;
  }

  function stick() {
    stickRef.current = true;
  }

  return { listRef, onScroll, stick };
}
