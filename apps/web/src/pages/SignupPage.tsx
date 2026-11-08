import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import styles from './AuthForm.module.css';
import type { LoginPageState } from './LoginPage';

function signupErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return '이미 가입한 이메일입니다.';
  }
  if (err instanceof ApiError && err.status === 400) {
    return '입력한 값을 다시 확인해 주세요.';
  }
  if (err instanceof ApiError && err.status === 429) {
    return '가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  return '가입하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function SignupPage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, nickname, password }),
      });
      const next: LoginPageState = { email, signedUp: true };
      void navigate('/login', { state: next });
    } catch (err) {
      setError(signupErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card}>
      <h1 className={styles.title}>회원가입</h1>
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <label className={styles.field}>
          이메일
          <input
            className={styles.input}
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          닉네임
          <input
            className={styles.input}
            name="nickname"
            autoComplete="nickname"
            required
            maxLength={20}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <span className={styles.hint}>
            방송 목록에 스트리머 이름으로 보입니다.
          </span>
        </label>
        <label className={styles.field}>
          비밀번호
          <input
            className={styles.input}
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className={styles.hint}>8자 이상</span>
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button className={styles.submit} type="submit" disabled={submitting}>
          가입하기
        </button>
      </form>
      <p className={styles.footer}>
        이미 계정이 있으신가요? <Link to="/login">로그인</Link>
      </p>
    </section>
  );
}
