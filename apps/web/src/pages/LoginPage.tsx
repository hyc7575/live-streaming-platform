import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api';
import { useAuth } from '../auth/auth-context';
import { useDocumentTitle } from '../use-document-title';
import styles from './AuthForm.module.css';
import { TestAccountLogin } from './TestAccountLogin';

export interface LoginPageState {
  email?: string;
  signedUp?: boolean;
  // The in-app path to return to after logging in.
  from?: string;
}

function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 401) {
    return '이메일 또는 비밀번호가 맞지 않습니다.';
  }
  if (err instanceof ApiError && err.status === 429) {
    return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  return '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function LoginPage() {
  useDocumentTitle('로그인');
  const { state, logIn, logInAsTestAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state ?? {}) as LoginPageState;
  const [email, setEmail] = useState(from.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const returnTo = from.from ?? '/';

  if (state.status === 'authenticated' && !submitting) {
    return <Navigate to={returnTo} replace />;
  }

  async function submit(attempt: () => Promise<void>) {
    setSubmitting(true);
    setError(null);
    try {
      await attempt();
      void navigate(returnTo, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(() => logIn(email, password));
  }

  return (
    <section className={styles.card}>
      <h1 className={styles.title}>로그인</h1>
      {from.signedUp && (
        <p className={styles.notice}>가입했습니다. 로그인해 주세요.</p>
      )}
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <label className={styles.field}>
          이메일
          <input
            className={styles.input}
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          비밀번호
          <input
            className={styles.input}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button className={styles.submit} type="submit" disabled={submitting}>
          로그인
        </button>
      </form>
      <TestAccountLogin
        disabled={submitting}
        onLogIn={(account) => void submit(() => logInAsTestAccount(account))}
      />
      <p className={styles.footer}>
        계정이 없으신가요?{' '}
        <Link to="/signup" state={{ from: from.from } satisfies LoginPageState}>
          회원가입
        </Link>
      </p>
    </section>
  );
}
