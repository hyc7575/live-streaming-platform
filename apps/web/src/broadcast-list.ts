import type { Broadcast } from './broadcasts';
import type { BroadcastCategory } from './categories';

// 홈 목록에 무엇을 그릴지. 빈 문구는 앞의 것이 이긴다. 받아 온 목록이
// 비었으면 탭의 빈 문구, 카테고리에 방송이 없으면 카테고리 문구,
// 그다음에야 검색어 문구다.
export type ListView =
  | { kind: 'empty' }
  | { kind: 'noCategoryMatch'; category: BroadcastCategory }
  | { kind: 'noQueryMatch' }
  | { kind: 'shown'; broadcasts: Broadcast[] };

// 이미 받은 목록을 거르므로, 최신 PUBLIC_LIST_LIMIT개 방송만
// 걸린다. 목록이 그보다 커지면 서버 검색으로 바꾼다.
function matches(broadcast: Broadcast, needle: string) {
  return (
    broadcast.title.toLowerCase().includes(needle) ||
    broadcast.streamer.nickname.toLowerCase().includes(needle)
  );
}

export function viewList(
  list: Broadcast[],
  category: BroadcastCategory | null,
  query: string,
): ListView {
  if (list.length === 0) return { kind: 'empty' };
  const inCategory = category
    ? list.filter((b) => b.category === category)
    : list;
  if (category && inCategory.length === 0)
    return { kind: 'noCategoryMatch', category };
  const needle = query.trim().toLowerCase();
  const shown = inCategory.filter((b) => matches(b, needle));
  if (shown.length === 0) return { kind: 'noQueryMatch' };
  return { kind: 'shown', broadcasts: shown };
}
