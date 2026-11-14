import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { type AuthUser, useAuth } from '../auth/auth-context';
import type { LoginPageState } from '../pages/LoginPage';
import styles from './UserImageField.module.css';

// 두 슬롯 모두 API가 검사하는 것과 같은 제한. 잘못된 파일은
// 보내기 전에 거부한다.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;
const INVALID_FILE = '2MB 이하의 JPEG·PNG·WebP 이미지만 올릴 수 있습니다.';

// API가 보관하는 사용자별 이미지마다: 보낼 곳과, 그 이미지를 가리키는
// user 필드.
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

// 호출자의 이미지 하나를 올리거나 바꾸거나 지운다. 응답은
// 갱신된 user이고, auth 상태에 넣어 모든 화면이 바로 보게 한다.
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
  // 401 뒤 로그인 페이지가 사용자를 돌려보낼 곳.
  returnTo: string;
  // 자기 크기가 있는 미리보기(아바타 원)는 기본 대기 이미지 미리보기의 넓은 열을
  // 차지하지 않고 버튼 바로 옆에 놓인다.
  compact?: boolean;
}) {
  const { state, setUser } = useAuth();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // RequireAuth 아래 화면만 이 필드를 렌더한다.
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
    // 같은 파일을 다시 골라도 change가 일어나도록 비운다.
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
