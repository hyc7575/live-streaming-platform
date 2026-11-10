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

// The one owner of GET /api/me/follows. The panel, the follow button and the
// following page all read this, so a follow shows up everywhere at once.
export function FollowsProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.user.id : null;
  // Tagged with the user it belongs to, so logging in as someone else never
  // shows the previous user's list.
  const [result, setResult] = useState<{
    userId: string;
    loadable: Loadable<FollowedStreamer[]>;
  } | null>(null);
  const reloadRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let latest = 0;
    // Only the most recently started read may land: a poll that began before
    // a follow must not overwrite the re-read that follows it.
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
