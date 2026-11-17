import type { Broadcast } from './broadcasts';
import type { BroadcastCategory } from './categories';
import type { BroadcastStatus } from './components/StatusBadge';

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

const LIST_ORDER: Record<BroadcastStatus, number> = {
  LIVE: 0,
  READY: 1,
  ENDED: 2,
};

// 표시 상태(live-display)로 바꾼 목록을 LIVE·방송 준비 중·방송 종료 순으로
// 다시 세운다. API는 실제 상태로 묶어 보내므로, 막 LIVE가 되어 "방송 준비 중"으로
// 보이는 방송이 LIVE 묶음 맨 앞에 남지 않게 한다. 같은 상태 안의 순서는 그대로다.
// `only`가 있으면(상태 탭) 그 상태만 남긴다. `?status=LIVE`로 받은 목록에서
// 아직 LIVE로 보이지 않는 방송을 거른다.
export function arrangeForList(
  list: readonly Broadcast[],
  only: BroadcastStatus | null,
): Broadcast[] {
  const kept = only ? list.filter((b) => b.status === only) : [...list];
  return kept.sort((a, b) => LIST_ORDER[a.status] - LIST_ORDER[b.status]);
}
