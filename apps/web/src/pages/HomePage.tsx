import { Link, useSearchParams } from 'react-router';
import type { Broadcast } from '../broadcasts';
import { BroadcastGrid } from '../components/BroadcastGrid';
import { useApi } from '../use-api';
import styles from './ListPage.module.css';

const FILTERS = [
  { status: null, label: '전체', empty: '아직 공개된 방송이 없습니다.' },
  { status: 'LIVE', label: 'LIVE', empty: '지금 LIVE인 방송이 없습니다.' },
  { status: 'ENDED', label: '방송 종료', empty: '끝난 방송이 없습니다.' },
] as const;

export function HomePage() {
  const [params] = useSearchParams();
  const filter =
    FILTERS.find((f) => f.status === params.get('status')) ?? FILTERS[0];
  const broadcasts = useApi<Broadcast[]>(
    filter.status ? `/broadcasts?status=${filter.status}` : '/broadcasts',
  );

  return (
    <section>
      <div className={styles.heading}>
        <h1 className={styles.title}>방송 목록</h1>
        <Link to="/studio/new" className={styles.create}>
          방송 만들기
        </Link>
      </div>
      <nav className={styles.filters} aria-label="방송 상태">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            to={f.status ? `/?status=${f.status}` : '/'}
            className={styles.filter}
            aria-current={f === filter ? 'page' : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {broadcasts.status === 'failed' && (
        <p role="alert">방송 목록을 불러오지 못했습니다.</p>
      )}
      {broadcasts.status === 'loaded' &&
        (broadcasts.data.length === 0 ? (
          <p className={styles.empty}>{filter.empty}</p>
        ) : (
          <BroadcastGrid broadcasts={broadcasts.data} />
        ))}
    </section>
  );
}
