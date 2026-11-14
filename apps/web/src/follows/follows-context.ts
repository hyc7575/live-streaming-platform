import { createContext, useContext } from 'react';
import type { Loadable } from '../use-api';
import type { FollowedStreamer } from './follows';

export interface FollowsContextValue {
  // 아무도 로그인하지 않았으면 null이다. 불러올 목록이 없다.
  follows: Loadable<FollowedStreamer[]> | null;
  isFollowing: (streamerId: string) => boolean;
  // 목록을 다시 읽으면 resolve하고, 팔로우나
  // 언팔로우 자체가 실패하면 reject한다.
  setFollowing: (streamerId: string, following: boolean) => Promise<void>;
}

export const FollowsContext = createContext<FollowsContextValue | null>(null);

export function useFollows(): FollowsContextValue {
  const value = useContext(FollowsContext);
  if (!value) {
    throw new Error('useFollows() must be used inside <FollowsProvider>');
  }
  return value;
}
