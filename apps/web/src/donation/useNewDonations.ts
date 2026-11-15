import { useEffect, useEffectEvent, useRef } from 'react';
import type { Donation, DonationSummary } from '../donations';
import { usePolledApi, type Loadable } from '../use-api';

// 시청 화면 후원 패널·댓글과 같은 주기다(PRD §8.2: 실시간 push 없음).
export const DONATION_POLL_MS = 5000;

/**
 * 방송의 후원 목록을 5초마다 읽고, 처음 보는 후원을 `onNew`로 알린다.
 *
 * 처음 받은 응답은 기준선으로만 쓴다. 화면을 열거나 새로고침할 때 이미 있던
 * 후원은 알리지 않는다. 이후 응답에서 처음 보는 `id`를 오래된 순으로 한 번에
 * 넘긴다. 다시 읽기가 실패하면 그 사이 온 후원은 다음 성공 응답에서 알린다.
 * 같은 응답을 쓰는 목록·합계도 그리도록 요약과 `reload`를 함께 돌려준다.
 */
export function useNewDonations(
  broadcastId: string,
  onNew: (donations: Donation[]) => void,
): { summary: Loadable<DonationSummary>; reload: () => void } {
  const { data: summary, reload } = usePolledApi<DonationSummary>(
    `/broadcasts/${encodeURIComponent(broadcastId)}/donations`,
    DONATION_POLL_MS,
  );
  // 이 방송에서 이미 본 후원 id. 방송이 바뀌면 기준선부터 다시 잡는다.
  const seen = useRef<{ broadcastId: string; ids: Set<string> } | null>(null);
  const report = useEffectEvent(onNew);
  const loaded = summary.status === 'loaded' ? summary.data : null;

  useEffect(() => {
    if (!loaded) return;
    if (seen.current?.broadcastId !== broadcastId) {
      seen.current = {
        broadcastId,
        ids: new Set(loaded.donations.map((d) => d.id)),
      };
      return;
    }
    const { ids } = seen.current;
    const fresh = loaded.donations.filter((d) => !ids.has(d.id));
    if (fresh.length === 0) return;
    fresh.forEach((d) => ids.add(d.id));
    report(fresh.sort(byApprovedAt));
  }, [loaded, broadcastId]);

  return { summary, reload };
}

function byApprovedAt(a: Donation, b: Donation): number {
  return a.approvedAt < b.approvedAt ? -1 : a.approvedAt > b.approvedAt ? 1 : 0;
}
