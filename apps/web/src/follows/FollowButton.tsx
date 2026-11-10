import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../auth/auth-context';
import styles from './FollowButton.module.css';
import { returnHere } from './follows';
import { useFollows } from './follows-context';

// Sits next to the streamer's name on the watch page. The caller leaves it
// out for the streamer's own broadcast.
export function FollowButton({ streamerId }: { streamerId: string }) {
  const { state } = useAuth();
  const location = useLocation();
  const { isFollowing, setFollowing } = useFollows();
  // Shown from the click until the list has been re-read, so the button
  // answers at once; cleared either way, which reverts it on failure.
  const [pending, setPending] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  if (state.status === 'loading') return null;
  if (state.status === 'anonymous') {
    return (
      <Link to="/login" state={returnHere(location)} className={styles.login}>
        로그인하고 팔로우
      </Link>
    );
  }

  const following = pending ?? isFollowing(streamerId);

  async function toggle() {
    const next = !following;
    setPending(next);
    setFailed(false);
    try {
      await setFollowing(streamerId, next);
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-pressed={following}
        disabled={pending !== null}
        className={following ? styles.following : styles.follow}
        onClick={() => void toggle()}
      >
        {following ? '팔로잉' : '팔로우'}
      </button>
      {failed && (
        <span role="alert" className={styles.error}>
          {following ? '언팔로우하지 못했습니다.' : '팔로우하지 못했습니다.'}
        </span>
      )}
    </>
  );
}
