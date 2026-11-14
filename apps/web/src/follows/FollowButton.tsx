import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../auth/auth-context';
import styles from './FollowButton.module.css';
import { returnHere } from './follows';
import { useFollows } from './follows-context';

// 시청 페이지에서 스트리머 이름 옆에 놓인다. 스트리머 자신의 방송에서는
// 호출하는 쪽이 이 버튼을 뺀다.
export function FollowButton({ streamerId }: { streamerId: string }) {
  const { state } = useAuth();
  const location = useLocation();
  const { isFollowing, setFollowing } = useFollows();
  // 클릭부터 목록을 다시 읽을 때까지 보인다. 그래서 버튼이 바로
  // 반응한다. 성공하든 실패하든 지우므로, 실패하면 원래대로 돌아간다.
  const [pending, setPending] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  if (state.status === 'loading' || state.status === 'error') return null;
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
