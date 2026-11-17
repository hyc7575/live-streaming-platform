import { useEffect, useState } from 'react';
import type { Broadcast } from './broadcasts';
import type { BroadcastStatus } from './components/StatusBadge';

// 송출이 붙어 LIVE가 된 뒤 이만큼은 공개 화면에 "방송 준비 중"(READY)으로
// 보인다(#249). 그 순간 OME의 LL-HLS 플레이리스트가 아직 없어(#102) 시청자가
// 로딩만 보기 때문이다. 2026-11-17 측정의 대기 중위값(12.4초)을 보고 10초로
// 정했다. 서버 상태는 그대로이고, 송출 화면·소유자 조작·스튜디오 목록은 실제
// 상태를 쓴다.
export const LIVE_DISPLAY_DELAY_MS = 10_000;

export type LiveTiming = Pick<Broadcast, 'id' | 'status' | 'startedAt'>;

// 표시 지연이 끝나는 시각(클라이언트 시계, ms)이다. 늦출 것이 없으면 null이다.
// `seenAt`은 이 화면이 그 LIVE를 처음 읽은 클라이언트 시각이다. 클라이언트
// 시계가 서버보다 늦어 `startedAt`이 미래로 보여도 `seenAt`부터 10초를 넘기지
// 않는다. `startedAt`이 없으면(서버는 LIVE에 늘 채운다) 늦추지 않는다.
export function liveDisplayEndsAt(
  b: Pick<Broadcast, 'status' | 'startedAt'>,
  seenAt: number,
): number | null {
  if (b.status !== 'LIVE' || b.startedAt === null) return null;
  const started = Date.parse(b.startedAt);
  if (Number.isNaN(started)) return null;
  return Math.min(started, seenAt) + LIVE_DISPLAY_DELAY_MS;
}

// 공개 화면에 보일 상태다. 실제 LIVE이고 지연이 끝나기 전이면 READY,
// 그 밖은 실제 상태다.
export function displayStatus(
  b: Pick<Broadcast, 'status' | 'startedAt'>,
  now: number,
  seenAt: number = now,
): BroadcastStatus {
  const endsAt = liveDisplayEndsAt(b, seenAt);
  return endsAt !== null && now < endsAt ? 'READY' : b.status;
}

// 같은 방송이라도 다시 LIVE가 되어 startedAt이 바뀌면 새로 본 것으로 센다.
function seenKey(b: LiveTiming): string {
  return `${b.id}@${b.startedAt ?? ''}`;
}

// seenKey → 이 탭이 그 LIVE를 처음 읽은 클라이언트 시각. 화면을 옮겨도(목록 →
// 시청) 같은 기준을 쓰도록 탭 하나에 하나만 둔다. 방송 수십 개 규모라 지우지 않는다.
const firstSeen = new Map<string, number>();

// 목록의 표시 상태를 정하는 함수를 돌려주고, 가장 이른 지연이 끝나는 순간
// 다시 그린다. 그래서 시청 화면은 다음 5초 조회를 기다리지 않고 플레이어로,
// 목록은 다음 30초 조회를 기다리지 않고 LIVE로 바뀐다.
export function useLiveDisplay(
  items: readonly LiveTiming[],
): (b: LiveTiming) => BroadcastStatus {
  const [now, setNow] = useState(Date.now);
  // 응답 배열은 조회마다 새로 올 수 있어, LIVE 방송의 키 문자열로 바뀜을 잰다.
  const liveKeys = items
    .filter((b) => b.status === 'LIVE')
    .map(seenKey)
    .join('\n');

  useEffect(() => {
    if (liveKeys === '') return;
    const at = Date.now();
    for (const key of liveKeys.split('\n'))
      if (!firstSeen.has(key)) firstSeen.set(key, at);
  }, [liveKeys]);

  // 아직 적지 않은 방송(effect 전 첫 렌더)은 마지막으로 잰 `now`에 본 것으로
  // 다룬다. `now`가 오래됐으면 READY로 보이고 아래 타이머가 바로 다시 잰다.
  // 오래된 `now`로는 늦춰야 할 방송이 LIVE로 보이는 일이 없다.
  const seenAt = (b: LiveTiming) => firstSeen.get(seenKey(b)) ?? now;
  const statusOf = (b: LiveTiming) => displayStatus(b, now, seenAt(b));

  let next: number | null = null;
  for (const b of items) {
    const endsAt = liveDisplayEndsAt(b, seenAt(b));
    if (endsAt !== null && endsAt > now && (next === null || endsAt < next))
      next = endsAt;
  }

  useEffect(() => {
    if (next === null) return;
    const at = next;
    const timer = setTimeout(
      // 타이머가 조금 일찍 불려도 그 시각을 지난 것으로 다뤄 다시 걸지 않는다.
      () => setNow(Math.max(Date.now(), at)),
      Math.max(0, at - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [next]);

  return statusOf;
}

// 공개 화면에 그릴 방송 목록이다. 상태만 표시 상태로 바꾼다.
export function useDisplayedBroadcasts(
  list: readonly Broadcast[],
): Broadcast[] {
  const statusOf = useLiveDisplay(list);
  return list.map((b) => {
    const status = statusOf(b);
    return status === b.status ? b : { ...b, status };
  });
}

// 시청 화면처럼 방송 하나를 그릴 때 쓴다.
export function useDisplayedBroadcast(b: Broadcast): Broadcast {
  const status = useLiveDisplay([b])(b);
  return status === b.status ? b : { ...b, status };
}
