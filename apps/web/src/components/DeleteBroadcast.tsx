import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import type { LoginPageState } from '../pages/LoginPage';
import buttons from './OwnerActions.module.css';
import styles from './DeleteBroadcast.module.css';

// 송출을 시작하기 전(READY)에 송출 화면에서 방송을 지운다. LIVE 방송의
// 종료와 삭제는 시청 화면의 OwnerActions가 맡는다. 호출자가 이 컨트롤을
// 보일 때를 정한다.
export function DeleteBroadcast({ broadcastId }: { broadcastId: string }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) cancel.current?.focus();
  }, [confirming]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<void>(`/broadcasts/${broadcastId}`, { method: 'DELETE' });
      void navigate('/studio');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next: LoginPageState = {
          from: `/studio/broadcasts/${broadcastId}`,
        };
        void navigate('/login', { state: next });
        return;
      }
      // 이미 삭제됐다(예: 다른 탭에서). 지울 것이 남아 있지 않다.
      if (err instanceof ApiError && err.status === 404) {
        void navigate('/studio');
        return;
      }
      setError(
        err instanceof ApiError && err.status === 403
          ? '권한이 없습니다.'
          : '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={buttons.button}
        onClick={() => setConfirming(true)}
      >
        방송 삭제
      </button>
      {error && (
        <p className={buttons.error} role="alert">
          {error}
        </p>
      )}
      {confirming && (
        <div className={styles.backdrop}>
          <div
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-label="삭제 확인"
            aria-describedby="delete-broadcast-text"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) setConfirming(false);
            }}
          >
            <p id="delete-broadcast-text" className={styles.text}>
              이 방송을 삭제할까요? 삭제하면 되돌릴 수 없습니다.
            </p>
            <div className={styles.row}>
              <button
                type="button"
                className={buttons.danger}
                disabled={busy}
                onClick={() => void run()}
              >
                삭제하기
              </button>
              <button
                ref={cancel}
                type="button"
                className={buttons.button}
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
