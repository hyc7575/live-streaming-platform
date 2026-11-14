import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Loadable } from '../use-api';
import { FOLLOWS_POLL_MS, type FollowedStreamer } from './follows';
import { FollowsContext, type FollowsContextValue } from './follows-context';

const LOADING: Loadable<never> = { status: 'loading' };

// GET /api/me/follows를 가진 유일한 곳이다. 패널, 팔로우 버튼,
// 팔로잉 페이지가 모두 이것을 읽으므로, 팔로우가 어디서나 한꺼번에 보인다.
export function FollowsProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.user.id : null;
  // 목록의 주인인 사용자를 붙여 둔다. 그래서 다른 사람으로 로그인해도
  // 이전 사용자의 목록이 보이지 않는다.
  const [result, setResult] = useState<{
    userId: string;
    loadable: Loadable<FollowedStreamer[]>;
  } | null>(null);
  const reloadRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let latest = 0;
    // 가장 최근에 시작한 읽기만 반영한다. 팔로우 전에 시작한 폴링이
    // 팔로우 뒤의 다시 읽기를 덮어쓰면 안 된다.
    const load = async () => {
      const mine = ++latest;
      try {
        const data = await apiFetch<FollowedStreamer[]>('/me/follows');
        if (!cancelled && mine === latest) {
          setResult({ userId, loadable: { status: 'loaded', data } });
        }
      } catch (error) {
        if (cancelled || mine !== latest) return;
        setResult((prev) =>
          prev?.userId === userId && prev.loadable.status === 'loaded'
            ? prev
            : { userId, loadable: { status: 'failed', error } },
        );
      }
    };
    void load();
    const timer = setInterval(() => void load(), FOLLOWS_POLL_MS);
    reloadRef.current = load;
    return () => {
      cancelled = true;
      clearInterval(timer);
      reloadRef.current = () => Promise.resolve();
    };
  }, [userId]);

  const follows: Loadable<FollowedStreamer[]> | null = !userId
    ? null
    : result?.userId === userId
      ? result.loadable
      : LOADING;

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
      await reloadRef.current();
    },
    [],
  );

  const value = useMemo<FollowsContextValue>(
    () => ({ follows, isFollowing, setFollowing }),
    [follows, isFollowing, setFollowing],
  );

  return <FollowsContext value={value}>{children}</FollowsContext>;
}
