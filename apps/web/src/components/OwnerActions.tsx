import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import type { Broadcast } from '../broadcasts';
import type { LoginPageState } from '../pages/LoginPage';
import styles from './OwnerActions.module.css';

function deleteErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) return '권한이 없습니다.';
  return '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

// Edit and delete for the broadcast's own streamer. The caller decides who
// sees this; the API refuses everyone else regardless.
export function OwnerActions({ broadcast }: { broadcast: Broadcast }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the server says the broadcast went LIVE after this page loaded.
  const [wentLive, setWentLive] = useState(false);
  const live = broadcast.status === 'LIVE' || wentLive;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiFetch<void>(`/broadcasts/${broadcast.id}`, { method: 'DELETE' });
      void navigate('/studio');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next: LoginPageState = { from: `/broadcasts/${broadcast.id}` };
        void navigate('/login', { state: next });
        return;
      }
      // Already deleted, say from another tab: the goal is met.
      if (err instanceof ApiError && err.status === 404) {
        void navigate('/studio');
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setWentLive(true);
      } else {
        setError(deleteErrorMessage(err));
      }
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className={styles.actions}>
      <div className={styles.row}>
        <Link
          to={`/studio/broadcasts/${broadcast.id}/edit`}
          className={styles.button}
        >
          수정
        </Link>
        {!live && !confirming && (
          <button
            type="button"
            className={styles.button}
            onClick={() => setConfirming(true)}
          >
            삭제
          </button>
        )}
      </div>
      {live && (
        <p className={styles.hint}>
          송출 중인 방송은 종료한 뒤 삭제할 수 있습니다.
        </p>
      )}
      {confirming && (
        <div className={styles.confirm} role="group" aria-label="삭제 확인">
          <p className={styles.confirmText}>
            이 방송을 삭제할까요? 삭제하면 되돌릴 수 없습니다.
          </p>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.danger}
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              삭제하기
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              취소
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
