import { useSyncExternalStore } from 'react';

// CSS의 `min-width: 1024px` media query와 같은 breakpoint다.
// 이 너비 이상에서 시청 페이지는 채팅을 플레이어 옆에 둔다.
const WIDE = '(min-width: 1024px)';
// 마우스처럼 정밀한 포인터다. 터치 태블릿은 넓어도 여기에 들지 않는다.
const FINE_POINTER = '(pointer: fine)';

// matchMedia가 없으면(jsdom) `fallback`을 돌려준다.
function useMediaQuery(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () =>
      typeof window.matchMedia === 'function'
        ? window.matchMedia(query).matches
        : fallback,
  );
}

// matchMedia가 없으면(jsdom) 넓은 화면으로 본다.
export function useWideScreen(): boolean {
  return useMediaQuery(WIDE, true);
}

// matchMedia가 없으면(jsdom) 정밀한 포인터가 아니라고 본다. 그래서 결제는
// 지금처럼 새 탭으로 연다.
export function useFinePointer(): boolean {
  return useMediaQuery(FINE_POINTER, false);
}
