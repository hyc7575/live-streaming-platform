import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { type AuthUser, useAuth } from '../auth/auth-context';
import { UserAvatar } from '../components/UserAvatar';
import { UserImageField } from '../components/UserImageField';
import { BIO_MAX_LENGTH, NICKNAME_MAX_LENGTH } from '../profile';
import { useDocumentTitle } from '../use-document-title';
import type { LoginPageState } from './LoginPage';
import listStyles from './ListPage.module.css';
import styles from './ProfilePage.module.css';

const INVALID = `닉네임은 1~${NICKNAME_MAX_LENGTH}자, 소개는 ${BIO_MAX_LENGTH}자까지 쓸 수 있습니다.`;

type Save =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'failed'; message: string };

// /me/profile: the profile image, nickname and introduction the channel page
// shows (PRD-mypage 7.3). A test account's nickname change comes back 403
// with the API's own sentence, which is shown as is.
export function ProfilePage() {
  useDocumentTitle('프로필');
  const { state } = useAuth();
  // RequireAuth renders this page only for a logged-in user.
  if (state.status !== 'authenticated') return null;
  const user = state.user;

  return (
    <section>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>프로필</h1>
      </div>
      <section className={styles.section} aria-labelledby="profile-image">
        <h2 id="profile-image" className={styles.sectionTitle}>
          프로필 이미지
        </h2>
        <UserImageField
          slot="avatar"
          compact
          previewClassName=""
          preview={
            <UserAvatar
              nickname={user.nickname}
              avatarUrl={user.avatarUrl}
              className={styles.avatarPreview}
            />
          }
          confirmText="프로필 이미지를 삭제할까요? 채널 페이지와 헤더에 닉네임 첫 글자가 보입니다."
          returnTo="/me/profile"
        />
      </section>
      <section className={styles.section} aria-labelledby="profile-text">
        <h2 id="profile-text" className={styles.sectionTitle}>
          닉네임과 소개
        </h2>
        <ProfileForm key={user.id} user={user} />
      </section>
    </section>
  );
}

function ProfileForm({ user }: { user: AuthUser }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(user.nickname);
  const [bio, setBio] = useState(user.bio);
  const [save, setSave] = useState<Save>({ status: 'idle' });
  const changed = nickname !== user.nickname || bio !== user.bio;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (nickname.trim() === '') {
      setSave({ status: 'failed', message: INVALID });
      return;
    }
    setSave({ status: 'saving' });
    try {
      const updated = await apiFetch<AuthUser>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ nickname, bio }),
      });
      setUser(updated);
      setNickname(updated.nickname);
      setBio(updated.bio);
      setSave({ status: 'saved' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next: LoginPageState = { from: '/me/profile' };
        void navigate('/login', { state: next });
        return;
      }
      setSave({
        status: 'failed',
        message:
          err instanceof ApiError && err.status === 403
            ? (err.serverMessage ?? '권한이 없습니다.')
            : err instanceof ApiError && err.status === 400
              ? INVALID
              : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)}>
      <label className={styles.field}>
        <span className={styles.label}>
          닉네임
          <span className={styles.counter}>
            {nickname.length}/{NICKNAME_MAX_LENGTH}
          </span>
        </span>
        <input
          className={styles.input}
          name="nickname"
          maxLength={NICKNAME_MAX_LENGTH}
          required
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            setSave({ status: 'idle' });
          }}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>
          소개
          <span className={styles.counter}>
            {bio.length}/{BIO_MAX_LENGTH}
          </span>
        </span>
        <textarea
          className={styles.input}
          name="bio"
          maxLength={BIO_MAX_LENGTH}
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
            setSave({ status: 'idle' });
          }}
        />
      </label>
      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.save}
          disabled={!changed || save.status === 'saving'}
        >
          {save.status === 'saving' ? '저장하는 중…' : '저장'}
        </button>
        <div role="status">
          {save.status === 'saved' && (
            <p className={styles.saved}>저장했습니다.</p>
          )}
        </div>
      </div>
      {save.status === 'failed' && (
        <p className={styles.error} role="alert">
          {save.message}
        </p>
      )}
    </form>
  );
}
