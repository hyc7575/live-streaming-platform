import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { type AuthUser, useAuth } from '../auth/auth-context';
import type { LoginPageState } from '../pages/LoginPage';
import styles from './UserImageField.module.css';

// The same limits the API checks for both slots, so a wrong file is refused
// before it is sent.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;
const INVALID_FILE = '2MB 이하의 JPEG·PNG·WebP 이미지만 올릴 수 있습니다.';

// Each per-user image the API keeps: where it is sent and which field of the
// user names it.
const SLOTS = {
  standby: {
    path: '/me/standby-image',
    url: (u: AuthUser) => u.standbyImageUrl,
    cleared: (u: AuthUser): AuthUser => ({ ...u, standbyImageUrl: null }),
  },
  avatar: {
    path: '/me/avatar',
    url: (u: AuthUser) => u.avatarUrl,
    cleared: (u: AuthUser): AuthUser => ({ ...u, avatarUrl: null }),
  },
} as const;

export type UserImageSlot = keyof typeof SLOTS;

type Busy = 'upload' | 'delete' | null;

// Upload, replace or delete one of the caller's images. The answer is the
// updated user, put into the auth state so every screen sees it at once.
export function UserImageField({
  slot,
  preview,
  previewClassName,
  confirmText,
  returnTo,
  compact = false,
}: {
  slot: UserImageSlot;
  preview: ReactNode;
  previewClassName: string;
  confirmText: string;
  // Where the login page sends the user back after a 401.
  returnTo: string;
  // A preview with a size of its own (the avatar circle) sits right beside
  // the buttons instead of taking the standby preview's wide column.
  compact?: boolean;
}) {
  const { state, setUser } = useAuth();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only screens under RequireAuth render this field.
  if (state.status !== 'authenticated') return null;
  const user = state.user;
  const { path, url, cleared } = SLOTS[slot];

  async function send(
    action: Exclude<Busy, null>,
    request: () => Promise<AuthUser>,
  ) {
    setBusy(action);
    setError(null);
    try {
      setUser(await request());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next: LoginPageState = { from: returnTo };
        void navigate('/login', { state: next });
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        setError(err.serverMessage ?? INVALID_FILE);
      } else {
        setError(
          action === 'upload'
            ? '이미지를 올리지 못했습니다. 잠시 후 다시 시도해 주세요.'
            : '이미지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so picking the same file again still fires a change.
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_BYTES) {
      setError(INVALID_FILE);
      return;
    }
    const body = new FormData();
    body.append('image', file);
    void send('upload', () =>
      apiFetch<AuthUser>(path, { method: 'PUT', body }),
    );
  }

  function remove() {
    void send('delete', async () => {
      await apiFetch<void>(path, { method: 'DELETE' });
      return cleared(user);
    });
  }

  return (
    <div
      className={compact ? `${styles.layout} ${styles.compact}` : styles.layout}
    >
      <div className={previewClassName} aria-busy={busy === 'upload'}>
        {preview}
      </div>
      <div className={styles.controls}>
        <div className={styles.row}>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            hidden
            onChange={upload}
          />
          <button
            type="button"
            className={styles.primary}
            disabled={busy !== null}
            onClick={() => fileInput.current?.click()}
          >
            {busy === 'upload' ? '올리는 중…' : '이미지 선택'}
          </button>
          {url(user) && !confirming && (
            <button
              type="button"
              className={styles.button}
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
            >
              삭제
            </button>
          )}
        </div>
        <p className={styles.hint}>JPEG·PNG·WebP, 2MB 이하</p>
        {confirming && (
          <div className={styles.confirm} role="group" aria-label="삭제 확인">
            <p className={styles.confirmText}>{confirmText}</p>
            <div className={styles.row}>
              <button
                type="button"
                className={styles.danger}
                disabled={busy !== null}
                onClick={remove}
              >
                삭제하기
              </button>
              <button
                type="button"
                className={styles.button}
                disabled={busy !== null}
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
    </div>
  );
}
