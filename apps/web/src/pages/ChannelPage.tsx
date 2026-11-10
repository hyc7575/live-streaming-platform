import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { type AuthUser, useAuth } from '../auth/auth-context';
import { ThumbnailPicture } from '../components/BroadcastThumbnail';
import { StudioTabs } from '../components/StudioTabs';
import type { LoginPageState } from './LoginPage';
import styles from './ChannelPage.module.css';

// The same limits the API checks (PUT /api/me/standby-image), so a wrong file
// is refused before it is sent.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;
const INVALID_FILE = '2MB 이하의 JPEG·PNG·WebP 이미지만 올릴 수 있습니다.';

type Busy = 'upload' | 'delete' | null;

export function ChannelPage() {
  const { state, setUser } = useAuth();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // RequireAuth renders this page only for a logged-in user.
  if (state.status !== 'authenticated') return null;
  const user = state.user;

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
        const next: LoginPageState = { from: '/studio/channel' };
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
      apiFetch<AuthUser>('/me/standby-image', { method: 'PUT', body }),
    );
  }

  function remove() {
    void send('delete', async () => {
      await apiFetch<void>('/me/standby-image', { method: 'DELETE' });
      return { ...user, standbyImageUrl: null };
    });
  }

  return (
    <section>
      <StudioTabs />
      <h1 className={styles.title}>기본 대기 이미지</h1>
      <div className={styles.layout}>
        <div className={styles.preview} aria-busy={busy === 'upload'}>
          <ThumbnailPicture
            status="READY"
            text={user.nickname}
            standbyImageUrl={user.standbyImageUrl}
          />
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
            {user.standbyImageUrl && !confirming && (
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
              <p className={styles.confirmText}>
                대기 이미지를 삭제할까요? 방송 전 카드와 시청 화면에 첫 글자
                그림이 보입니다.
              </p>
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
      <p className={styles.note}>방송 전(READY) 카드와 시청 화면에 보입니다</p>
    </section>
  );
}
