import type { Broadcast } from './broadcasts';
import type { BroadcastCategory } from './categories';

// 홈 목록에 무엇을 그릴지. 카테고리를 골랐는데 그 방송이 없으면(받아 온 목록이
// 비었어도) 카테고리 문구가 탭의 빈 문구보다 먼저다.
export type ListView =
  | { kind: 'empty' }
  | { kind: 'noCategoryMatch'; category: BroadcastCategory }
  | { kind: 'shown'; broadcasts: Broadcast[] };

export function pickListView(
  list: Broadcast[],
  category: BroadcastCategory | null,
): ListView {
  const shown = category ? list.filter((b) => b.category === category) : list;
  if (category && shown.length === 0)
    return { kind: 'noCategoryMatch', category };
  if (shown.length === 0) return { kind: 'empty' };
  return { kind: 'shown', broadcasts: shown };
}
