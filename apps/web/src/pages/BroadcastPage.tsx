import { useParams } from 'react-router';
import { ApiError } from '../api';
import { useAuth } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import type { BroadcastStatus } from '../components/StatusBadge';
import { OwnerActions } from '../components/OwnerActions';
import { StatusBadge } from '../components/StatusBadge';
import { useApi } from '../use-api';
import styles from './BroadcastPage.module.css';

// Stands in the player area until the player lands with the viewing issue.
const PLAYER_NOTICE: Record<BroadcastStatus, string> = {
  READY: '아직 시작하지 않은 방송입니다.',
  LIVE: '플레이어를 준비하고 있습니다.',
  ENDED: '방송이 끝났습니다.',
};

export function BroadcastPage() {
  const { id = '' } = useParams();
  const { state } = useAuth();
  const broadcast = useApi<Broadcast>(`/broadcasts/${encodeURIComponent(id)}`);

  if (broadcast.status === 'loading') return null;
  if (broadcast.status === 'failed') {
    const notFound =
      broadcast.error instanceof ApiError && broadcast.error.status === 404;
    return (
      <section>
        <h1>
          {notFound ? '방송을 찾을 수 없습니다' : '방송을 불러오지 못했습니다'}
        </h1>
      </section>
    );
  }

  const b = broadcast.data;
  const isOwner =
    state.status === 'authenticated' && state.user.id === b.streamer.id;
  return (
    <section className={styles.page}>
      <div className={styles.player}>
        <p className={styles.notice}>{PLAYER_NOTICE[b.status]}</p>
      </div>
      <div className={styles.info}>
        <StatusBadge status={b.status} />
        <h1 className={styles.title}>{b.title}</h1>
        <p className={styles.streamer}>{b.streamer.nickname}</p>
        {b.description && <p className={styles.description}>{b.description}</p>}
        {isOwner && <OwnerActions broadcast={b} />}
      </div>
    </section>
  );
}
