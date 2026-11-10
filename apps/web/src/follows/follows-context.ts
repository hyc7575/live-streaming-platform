import { createContext, useContext } from 'react';
import type { Loadable } from '../use-api';
import type { FollowedStreamer } from './follows';

export interface FollowsContextValue {
  // null while nobody is logged in: there is no list to load.
  follows: Loadable<FollowedStreamer[]> | null;
  isFollowing: (streamerId: string) => boolean;
  // Resolves once the list has been re-read, and rejects when the follow or
  // unfollow itself failed.
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
