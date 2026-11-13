import { useLayoutEffect, useRef } from 'react';

// 끝에서 이 픽셀 수 안이면 목록이 맨 아래에 있다고 본다.
const STICK_THRESHOLD_PX = 40;

// `items`가 바뀔 때마다 목록을 최신(마지막) 항목까지 스크롤해 둔다.
// 시청자가 읽으려고 위로 올렸으면 그러지 않는다. `stick()`은 다시 켠다.
// 시청자가 직접 쓴 글에 쓴다.
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
