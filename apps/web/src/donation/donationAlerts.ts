import { useCallback, useReducer } from 'react';
import type { Donation } from '../donations';

/**
 * 새 후원 알림 표시 큐(S6, #164). 송출 화면 토스트와 시청 화면 배너가 같은
 * 규칙을 쓴다.
 *
 * - 한 번에 한 장만 띄우고, 들어온 순서(감지 훅이 오래된 순으로 준다)대로
 *   다음 장으로 넘긴다.
 * - 기다리는 알림이 MAX_WAITING_ALERTS건을 넘으면 남은 것을 "외 N건 후원"
 *   한 장으로 묶는다. 묶음이 기다리는 동안 온 후원도 묶음에 더해, 늦게 온
 *   후원이 먼저 뜨지 않게 한다.
 * - 같은 후원 id는 한 번만 띄운다. 네트워크가 끊겼다 돌아와 한꺼번에 와도
 *   같은 규칙이다.
 */

// 알림 한 장이 떠 있는 시간.
export const DONATION_ALERT_MS = 6000;
export const MAX_WAITING_ALERTS = 4;

export type DonationAlert =
  | { kind: 'donation'; key: string; donation: Donation }
  | { kind: 'more'; key: string; count: number };

export interface DonationAlerts {
  current: DonationAlert | null;
  waiting: Donation[];
  // 묶음 한 장으로 기다리는 후원 수.
  bundled: number;
  // 띄웠거나 기다리는 후원 id.
  seen: ReadonlySet<string>;
  // 묶음 카드마다 다른 key를 주어, 다음 묶음이 타이머를 새로 시작하게 한다.
  bundles: number;
}

export const EMPTY_ALERTS: DonationAlerts = {
  current: null,
  waiting: [],
  bundled: 0,
  seen: new Set(),
  bundles: 0,
};

export function enqueueAlerts(
  state: DonationAlerts,
  donations: Donation[],
): DonationAlerts {
  const seen = new Set(state.seen);
  let { current, bundled } = state;
  const waiting = [...state.waiting];
  for (const donation of donations) {
    if (seen.has(donation.id)) continue;
    seen.add(donation.id);
    if (!current) {
      current = toAlert(donation);
    } else if (bundled === 0 && waiting.length < MAX_WAITING_ALERTS) {
      waiting.push(donation);
    } else {
      bundled += 1;
    }
  }
  return { ...state, current, waiting, bundled, seen };
}

export function advanceAlerts(state: DonationAlerts): DonationAlerts {
  const [next, ...waiting] = state.waiting;
  if (next) return { ...state, current: toAlert(next), waiting };
  if (state.bundled > 0) {
    const bundles = state.bundles + 1;
    return {
      ...state,
      current: { kind: 'more', key: `more-${bundles}`, count: state.bundled },
      bundled: 0,
      bundles,
    };
  }
  return { ...state, current: null };
}

function toAlert(donation: Donation): DonationAlert {
  return { kind: 'donation', key: donation.id, donation };
}

type Action = { type: 'enqueue'; donations: Donation[] } | { type: 'advance' };

function reduce(state: DonationAlerts, action: Action): DonationAlerts {
  return action.type === 'enqueue'
    ? enqueueAlerts(state, action.donations)
    : advanceAlerts(state);
}

// 시청 화면 플레이어가 받는 쪽: 지금 장과 그 장의 표시 시간이 끝났음을 알리는 함수.
export type DonationAlertQueue = Pick<
  ReturnType<typeof useDonationAlerts>,
  'current' | 'advance'
>;

// 화면이 큐를 들고 있는 훅. `enqueue`는 감지 훅의 새 후원을, `advance`는
// 지금 장의 표시 시간이 끝났음을 받는다.
export function useDonationAlerts(): {
  current: DonationAlert | null;
  enqueue: (donations: Donation[]) => void;
  advance: () => void;
} {
  const [state, dispatch] = useReducer(reduce, EMPTY_ALERTS);
  const enqueue = useCallback(
    (donations: Donation[]) => dispatch({ type: 'enqueue', donations }),
    [],
  );
  const advance = useCallback(() => dispatch({ type: 'advance' }), []);
  return { current: state.current, enqueue, advance };
}
