import { useSyncExternalStore } from 'react';

// CSS의 `min-width: 1024px` media query와 같은 breakpoint다.
// 이 너비 이상에서 시청 페이지는 채팅을 플레이어 옆에 둔다.
const WIDE = '(min-width: 1024px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

// matchMedia가 없으면(jsdom) 넓은 화면으로 본다.
function isWide(): boolean {
  return (
    typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches
  );
}

export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, isWide);
}
