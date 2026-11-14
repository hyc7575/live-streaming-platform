import { useLayoutEffect, type RefObject } from 'react';

type Span = { left: number; right: number };

// 가로 스크롤 줄(`row`, 안쪽 여백 `pad`)에서 항목(`item`)이 잘려 있으면
// 다 보이도록 줄을 얼마나 스크롤할지 돌려준다. 이미 다 보이면 0이다.
// 줄보다 넓은 항목은 왼쪽 끝을 맞춘다.
export function revealOffset(row: Span, pad: number, item: Span): number {
  const left = row.left + pad;
  const right = row.right - pad;
  if (item.left < left) return item.left - left;
  if (item.right > right) return Math.min(item.right - right, item.left - left);
  return 0;
}

// 홈의 상태 탭·카테고리 칩 줄은 좁은 화면에서 가로로 스크롤한다. 줄 끝의
// 항목(예: "기타")을 고른 주소로 열면 고른 항목이 화면 밖에 있으므로,
// `aria-current` 항목이 보이게 줄 안에서만 스크롤한다. `scrollIntoView`는
// 페이지까지 움직여 쓰지 않는다. `current`가 바뀔 때마다 다시 맞춘다.
export function useRevealCurrent(
  ref: RefObject<HTMLElement | null>,
  current: unknown,
) {
  useLayoutEffect(() => {
    const row = ref.current;
    const item = row?.querySelector('[aria-current="page"]');
    if (!row || !item) return;
    const pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
    row.scrollLeft += revealOffset(
      row.getBoundingClientRect(),
      pad,
      item.getBoundingClientRect(),
    );
  }, [ref, current]);
}
