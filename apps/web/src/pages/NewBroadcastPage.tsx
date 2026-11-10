import { Link, useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import type { Broadcast } from '../broadcasts';
import {
  BroadcastForm,
  type BroadcastFields,
} from '../components/BroadcastForm';
import { useDocumentTitle } from '../use-document-title';
import styles from './AuthForm.module.css';
import type { LoginPageState } from './LoginPage';

export function NewBroadcastPage() {
  useDocumentTitle('방송 만들기');
  const navigate = useNavigate();

  async function create(fields: BroadcastFields): Promise<string | null> {
    try {
      const created = await apiFetch<Broadcast>('/broadcasts', {
        method: 'POST',
        body: JSON.stringify(fields),
      });
      // replace: going back from the publish page skips the spent form.
      void navigate(`/studio/broadcasts/${created.id}`, { replace: true });
      return null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next: LoginPageState = { from: '/studio/new' };
        void navigate('/login', { state: next });
        return null;
      }
      return err instanceof ApiError && err.status === 400
        ? '제목을 확인해 주세요.'
        : '방송을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }
  }

  return (
    <section className={styles.card}>
      <h1 className={styles.title}>방송 만들기</h1>
      <BroadcastForm submitLabel="만들기" onSubmit={create} />
      <p className={styles.footer}>
        <Link to="/studio">내 방송으로 돌아가기</Link>
      </p>
    </section>
  );
}
