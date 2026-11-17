import type { Location } from 'react-router';
import type { Broadcast } from '../broadcasts';
import { useLiveDisplay, type LiveTiming } from '../live-display';
import type { LoginPageState } from '../pages/LoginPage';

// 패널은 이 주기로, 그리고 팔로우가 바뀐 직후에 목록을 다시 읽는다.
export const FOLLOWS_POLL_MS = 30_000;

export const FOLLOWS_EMPTY = '방송을 보다가 팔로우하면 여기에 보입니다.';

// apps/api/src/follows/follows.service.ts의 FollowedStreamer와 같은 모양이다.
export interface FollowedStreamer {
  id: string;
  nickname: string;
  live: { broadcastId: string; title: string; startedAt: string } | null;
}

// GET /me/followers: 호출자의 팔로워를 최신순으로 담는다. `count`는
// 전부를 세고, `followers`는 최신 50명만 담는다.
export interface FollowerList {
  count: number;
  followers: { id: string; nickname: string; followedAt: string }[];
}

// 팔로우 목록의 한 줄이다. 로그인한 목록과 비로그인 상태의
// LIVE 방송 목록이 모두 이 모양으로 바뀌므로, 줄은 누가 보는지 묻지 않는다.
export interface FollowEntry {
  key: string;
  streamerId: string;
  nickname: string;
  live: { broadcastId: string; title: string } | null;
}

// `showsLive`가 false인 LIVE는 오프라인 줄로 그린다(막 LIVE가 된 방송, #249).
function followedEntries(
  follows: FollowedStreamer[],
  showsLive: (live: NonNullable<FollowedStreamer['live']>) => boolean,
): FollowEntry[] {
  return follows.map((s) => ({
    key: s.id,
    streamerId: s.id,
    nickname: s.nickname,
    live: s.live && showsLive(s.live) ? s.live : null,
  }));
}

function liveTiming(live: NonNullable<FollowedStreamer['live']>): LiveTiming {
  return { id: live.broadcastId, status: 'LIVE', startedAt: live.startedAt };
}

// 팔로우 패널과 `/following`의 줄이다. 막 LIVE가 된 방송은 10초 동안 LIVE 점
// 없이 오프라인 줄로 보이고, 지연이 끝나면 다음 조회를 기다리지 않고 바뀐다.
export function useFollowedEntries(follows: FollowedStreamer[]): FollowEntry[] {
  const statusOf = useLiveDisplay(
    follows.flatMap((s) => (s.live ? [liveTiming(s.live)] : [])),
  );
  return followedEntries(
    follows,
    (live) => statusOf(liveTiming(live)) === 'LIVE',
  );
}

export function liveEntries(broadcasts: Broadcast[]): FollowEntry[] {
  return broadcasts.map((b) => ({
    key: b.id,
    streamerId: b.streamer.id,
    nickname: b.streamer.nickname,
    live: { broadcastId: b.id, title: b.title },
  }));
}

// 방문자를 지금 있는 곳으로 되돌려 보낼 로그인 state다. 로그인과
// 가입 페이지 자체는 돌아올 곳이 아니다.
export function returnHere(location: Location): LoginPageState {
  if (location.pathname === '/login' || location.pathname === '/signup') {
    return {};
  }
  return { from: location.pathname + location.search };
}
