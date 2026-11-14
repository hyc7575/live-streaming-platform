import type { Broadcast } from './broadcasts';
import type { BroadcastCategory } from './categories';

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
