import { useCallback, useMemo, type ReactNode } from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import { usePolledApi, type Loadable } from '../use-api';
import { FOLLOWS_POLL_MS, type FollowedStreamer } from './follows';
import { FollowsContext, type FollowsContextValue } from './follows-context';

// GET /api/me/follows를 가진 유일한 곳이다. 패널, 팔로우 버튼,
// 팔로잉 페이지가 모두 이것을 읽으므로, 팔로우가 어디서나 한꺼번에 보인다.
export function FollowsProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.user.id : null;
  // 목록을 그 주인인 사용자로 묶는다. 그래서 다른 사람으로 로그인해도
  // 이전 사용자의 목록이 보이지 않는다.
  const { data, reload } = usePolledApi<FollowedStreamer[]>(
    userId ? '/me/follows' : null,
    FOLLOWS_POLL_MS,
    { key: userId ?? undefined },
  );
  const follows: Loadable<FollowedStreamer[]> | null = userId ? data : null;

  const followedIds = useMemo(
    () =>
      new Set(
        follows?.status === 'loaded' ? follows.data.map((s) => s.id) : [],
      ),
    [follows],
  );

  const isFollowing = useCallback(
    (streamerId: string) => followedIds.has(streamerId),
    [followedIds],
  );

  const setFollowing = useCallback(
    async (streamerId: string, following: boolean) => {
      await apiFetch<void>(
        `/streamers/${encodeURIComponent(streamerId)}/follow`,
        { method: following ? 'PUT' : 'DELETE' },
      );
      await reload();
    },
    [reload],
  );

  const value = useMemo<FollowsContextValue>(
    () => ({ follows, isFollowing, setFollowing }),
    [follows, isFollowing, setFollowing],
  );

  return <FollowsContext value={value}>{children}</FollowsContext>;
}
