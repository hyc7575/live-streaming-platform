import type { Location } from 'react-router';
import type { Broadcast } from '../broadcasts';
import type { LoginPageState } from '../pages/LoginPage';

// The panel re-reads its list this often, and right after a follow change.
export const FOLLOWS_POLL_MS = 30_000;

export const FOLLOWS_EMPTY = '방송을 보다가 팔로우하면 여기에 보입니다.';

// Mirrors FollowedStreamer from apps/api/src/follows/follows.service.ts.
export interface FollowedStreamer {
  id: string;
  nickname: string;
  live: { broadcastId: string; title: string; startedAt: string } | null;
}

// GET /me/followers: the caller's own followers, newest first. `count`
// covers them all, `followers` only the newest 50.
export interface FollowerList {
  count: number;
  followers: { id: string; nickname: string; followedAt: string }[];
}

// One row of a follow list. The logged-in list and the anonymous list of
// LIVE broadcasts both map into this, so a row never asks who is looking.
export interface FollowEntry {
  key: string;
  streamerId: string;
  nickname: string;
  live: { broadcastId: string; title: string } | null;
}

export function followedEntries(follows: FollowedStreamer[]): FollowEntry[] {
  return follows.map((s) => ({
    key: s.id,
    streamerId: s.id,
    nickname: s.nickname,
    live: s.live,
  }));
}

export function liveEntries(broadcasts: Broadcast[]): FollowEntry[] {
  return broadcasts.map((b) => ({
    key: b.id,
    streamerId: b.streamer.id,
    nickname: b.streamer.nickname,
    live: { broadcastId: b.id, title: b.title },
  }));
}

// Login state that brings the visitor back to where they are. The login and
// signup pages themselves are no place to come back to.
export function returnHere(location: Location): LoginPageState {
  if (location.pathname === '/login' || location.pathname === '/signup') {
    return {};
  }
  return { from: location.pathname + location.search };
}
