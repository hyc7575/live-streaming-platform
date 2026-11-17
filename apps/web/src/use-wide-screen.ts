import { useSyncExternalStore } from 'react';

// CSS의 `min-width: 1024px` media query와 같은 breakpoint다.
// 이 너비 이상에서 시청 페이지는 채팅을 플레이어 옆에 둔다.
const WIDE = '(min-width: 1024px)';
// 마우스처럼 정밀한 포인터다. 터치 태블릿은 넓어도 여기에 들지 않는다.
const FINE_POINTER = '(pointer: fine)';

type QueryStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
};

// useSyncExternalStore는 subscribe가 바뀌면 구독을 풀고 다시 건다. query별로
// 함수를 한 번만 만들어 렌더 사이에 같게 둔다.
const stores = new Map<string, QueryStore>();

function storeFor(query: string, fallback: boolean): QueryStore {
  let store = stores.get(query);
  if (!store) {
    store = {
      subscribe: (onChange) => {
        if (typeof window.matchMedia !== 'function') return () => {};
        const list = window.matchMedia(query);
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
      },
      getSnapshot: () =>
        typeof window.matchMedia === 'function'
          ? window.matchMedia(query).matches
          : fallback,
    };
    stores.set(query, store);
  }
  return store;
}

// matchMedia가 없으면(jsdom) `fallback`을 돌려준다. 같은 query는 같은
// fallback으로만 쓴다(캐시가 첫 fallback을 기억한다).
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const { subscribe, getSnapshot } = storeFor(query, fallback);
  return useSyncExternalStore(subscribe, getSnapshot);
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
