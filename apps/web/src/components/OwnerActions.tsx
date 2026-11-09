import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import type { Broadcast } from '../broadcasts';
import type { LoginPageState } from '../pages/LoginPage';
import styles from './OwnerActions.module.css';

type Action = 'end' | 'delete';

const CONFIRM_LABEL: Record<Action, string> = {
  end: '종료 확인',
  delete: '삭제 확인',
};

const CONFIRM_BUTTON: Record<Action, string> = {
  end: '종료하기',
  delete: '삭제하기',
};

function confirmText(action: Action, status: Broadcast['status']): string {
  if (action === 'end') {
    return '방송을 종료할까요? 송출이 끊기고 이 방송은 다시 시작할 수 없습니다.';
  }
  return status === 'LIVE'
    ? '송출 중인 방송입니다. 삭제하면 방송을 종료하고 되돌릴 수 없습니다.'
    : '이 방송을 삭제할까요? 삭제하면 되돌릴 수 없습니다.';
}

function failureMessage(action: Action, err: unknown): string {
  if (err instanceof ApiError && err.status === 403) return '권한이 없습니다.';
  return action === 'end'
    ? '방송을 종료하지 못했습니다. 다시 시도하세요.'
    : '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

// Publish, end, edit and delete for the broadcast's own streamer. The caller
// decides who sees this; the API refuses everyone else regardless.
// `onEnded` lets the page re-read the broadcast instead of waiting for its
// next poll.
export function OwnerActions({
  broadcast,
  onEnded,
}: {
  broadcast: Broadcast;
  onEnded: () => void;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    try {
      if (action === 'end') {
        await apiFetch<Broadcast>(`/broadcasts/${broadcast.id}/end`, {
          method: 'POST',
        });
        setBusy(false);
        setConfirming(null);
        onEnded();
      } else {
        await apiFetch<void>(`/broadcasts/${broadcast.id}`, {
          method: 'DELETE',
        });
        void navigate('/studio');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next: LoginPageState = { from: `/broadcasts/${broadcast.id}` };
        void navigate('/login', { state: next });
        return;
      }
      // Already deleted, say from another tab: there is nothing left to end
      // or delete.
      if (err instanceof ApiError && err.status === 404) {
        if (action === 'delete') {
          void navigate('/studio');
          return;
        }
        setBusy(false);
        setConfirming(null);
        onEnded();
        return;
      }
      setError(failureMessage(action, err));
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <div className={styles.actions}>
      <div className={styles.row}>
        {broadcast.status !== 'ENDED' && (
          <Link
            to={`/studio/broadcasts/${broadcast.id}`}
            className={styles.primary}
          >
            송출 화면
          </Link>
        )}
        {broadcast.status === 'LIVE' && !confirming && (
          <button
            type="button"
            className={styles.button}
            onClick={() => setConfirming('end')}
          >
            방송 종료
          </button>
        )}
        <Link
          to={`/studio/broadcasts/${broadcast.id}/edit`}
          className={styles.button}
        >
          수정
        </Link>
        {!confirming && (
          <button
            type="button"
            className={styles.button}
            onClick={() => setConfirming('delete')}
          >
            삭제
          </button>
        )}
      </div>
      {confirming && (
        <div
          className={styles.confirm}
          role="group"
          aria-label={CONFIRM_LABEL[confirming]}
        >
          <p className={styles.confirmText}>
            {confirmText(confirming, broadcast.status)}
          </p>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={() => void run(confirming)}
            >
              {CONFIRM_BUTTON[confirming]}
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => setConfirming(null)}
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
