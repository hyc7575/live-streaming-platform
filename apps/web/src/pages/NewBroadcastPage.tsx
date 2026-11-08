import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  type Broadcast,
} from '../broadcasts';
import styles from './AuthForm.module.css';
import type { LoginPageState } from './LoginPage';

export function NewBroadcastPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch<Broadcast>('/broadcasts', {
        method: 'POST',
        body: JSON.stringify({ title, description }),
      });
      void navigate('/studio');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next: LoginPageState = { from: '/studio/new' };
        void navigate('/login', { state: next });
        return;
      }
      setError(
        err instanceof ApiError && err.status === 400
          ? '제목을 확인해 주세요.'
          : '방송을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card}>
      <h1 className={styles.title}>방송 만들기</h1>
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <label className={styles.field}>
          제목
          <input
            className={styles.input}
            name="title"
            required
            maxLength={TITLE_MAX_LENGTH}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          설명 (선택)
          <textarea
            className={styles.input}
            name="description"
            rows={4}
            maxLength={DESCRIPTION_MAX_LENGTH}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button className={styles.submit} type="submit" disabled={submitting}>
          만들기
        </button>
      </form>
      <p className={styles.footer}>
        <Link to="/studio">내 방송으로 돌아가기</Link>
      </p>
    </section>
  );
}
