import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import {
  BroadcastForm,
  type BroadcastFields,
} from '../components/BroadcastForm';
import { useApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import styles from './AuthForm.module.css';
import type { LoginPageState } from './LoginPage';

export function EditBroadcastPage() {
  useDocumentTitle('방송 수정');
  const { id = '' } = useParams();
  const { state } = useAuth();
  const navigate = useNavigate();
  const path = `/broadcasts/${encodeURIComponent(id)}`;
  const broadcast = useApi<Broadcast>(path);

  if (broadcast.status === 'loading') return null;
  if (broadcast.status === 'failed') {
    const notFound =
      broadcast.error instanceof ApiError && broadcast.error.status === 404;
    return (
      <section className={styles.card}>
        <h1 className={styles.title}>
          {notFound ? '방송을 찾을 수 없습니다' : '방송을 불러오지 못했습니다'}
        </h1>
      </section>
    );
  }

  const b = broadcast.data;
  // RequireAuth guarantees a user here; the server checks ownership again.
  const isOwner =
    state.status === 'authenticated' && state.user.id === b.streamer.id;
  if (!isOwner) {
    return (
      <section className={styles.card}>
        <h1 className={styles.title}>권한이 없습니다</h1>
        <p className={styles.notice}>
          방송을 만든 스트리머만 수정할 수 있습니다.
        </p>
      </section>
    );
  }

  async function save(fields: BroadcastFields): Promise<string | null> {
    try {
      await apiFetch<Broadcast>(path, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
      void navigate(`/broadcasts/${b.id}`);
      return null;
    } catch (err) {
      if (!(err instanceof ApiError)) {
        return '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      }
      switch (err.status) {
        case 401: {
          const next: LoginPageState = {
            from: `/studio/broadcasts/${b.id}/edit`,
          };
          void navigate('/login', { state: next });
          return null;
        }
        case 400:
          return '제목을 확인해 주세요.';
        case 403:
          return '권한이 없습니다.';
        case 404:
          return '방송을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.';
        default:
          return '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      }
    }
  }

  return (
    <section className={styles.card}>
      <h1 className={styles.title}>방송 수정</h1>
      <BroadcastForm
        initial={{ title: b.title, description: b.description }}
        submitLabel="저장"
        onSubmit={save}
      />
      <p className={styles.footer}>
        <Link to={`/broadcasts/${b.id}`}>방송으로 돌아가기</Link>
      </p>
    </section>
  );
}
